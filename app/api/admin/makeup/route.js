import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/permissions'

// POST - Create a new makeup lesson (admin)
export async function POST(request) {
  const session = await getServerSession(authOptions)
  
  if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Check permission
  const permCheck = await checkPermission('makeup.create')
  if (!permCheck.allowed) {
    return NextResponse.json({ error: 'Nu ai permisiunea să creezi recuperări' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { groupId, teacherId, branchId, locationDetails, scheduledAt, notes, studentIds } = body

    if (!groupId || !teacherId || !scheduledAt) {
      return NextResponse.json({ error: 'Grupă, profesor și data sunt obligatorii' }, { status: 400 })
    }

    // Parse the scheduledAt - frontend sends format like "2025-01-24T10:00"
    // Store the time exactly as the user entered it (no timezone conversion)
    // We append 'Z' to make JavaScript interpret it as UTC, so when displayed
    // it shows the exact time entered (without local timezone conversion)
    const scheduledDate = new Date(scheduledAt + 'Z')

    // Create makeup lesson
    const makeupLesson = await prisma.makeupLesson.create({
      data: {
        groupId,
        teacherId,
        branchId: branchId || null,
        locationDetails: locationDetails || null,
        scheduledAt: scheduledDate,
        notes: notes || null,
        status: 'SCHEDULED',
        students: studentIds && studentIds.length > 0 ? {
          create: studentIds.map(studentId => ({
            studentId,
            status: 'PENDING'
          }))
        } : undefined
      },
      include: {
        teacher: {
          select: { id: true, name: true, email: true }
        },
        group: {
          include: {}
        },
        branch: {
          select: { id: true, name: true }
        },
        students: {
          include: { student: true }
        }
      }
    })

    return NextResponse.json(makeupLesson)
  } catch (error) {
    console.error('Error creating makeup lesson:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// GET - Fetch all makeup lessons with detailed info for admin
export async function GET(request) {
  const session = await getServerSession(authOptions)
  
  if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Check permission
  const permCheck = await checkPermission('makeup.view')
  if (!permCheck.allowed) {
    return NextResponse.json({ error: 'Nu ai permisiunea să vezi recuperările' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const teacherId = searchParams.get('teacherId')
    const status = searchParams.get('status')
    const groupId = searchParams.get('groupId')

    // Build filter
    const where = {}
    if (teacherId) where.teacherId = teacherId
    if (status) where.status = status
    if (groupId) where.groupId = groupId

    // Get all makeup lessons with full details
    const makeupLessons = await prisma.makeupLesson.findMany({
      where,
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        group: {
          include: {}
        },
        branch: {
          select: {
            id: true,
            name: true
          }
        },
        students: {
          include: {
            student: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Get all teachers who have created makeup lessons
    const teachers = await prisma.user.findMany({
      where: {
        role: 'TEACHER',
        makeupLessons: {
          some: {}
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        _count: {
          select: {
            makeupLessons: true
          }
        }
      }
    })

    // Get summary statistics per teacher
    const teacherStats = await Promise.all(
      teachers.map(async (teacher) => {
        const lessons = await prisma.makeupLesson.findMany({
          where: { teacherId: teacher.id },
          include: {
            students: true
          }
        })

        const completed = lessons.filter(l => l.status === 'COMPLETED')
        const scheduled = lessons.filter(l => l.status === 'SCHEDULED')
        const inProgress = lessons.filter(l => l.status === 'IN_PROGRESS')
        
        // Count students marked present/absent
        let presentCount = 0
        let absentCount = 0
        
        for (const lesson of lessons) {
          for (const student of lesson.students) {
            if (student.status === 'PRESENT') presentCount++
            if (student.status === 'ABSENT') absentCount++
          }
        }

        return {
          ...teacher,
          stats: {
            total: lessons.length,
            completed: completed.length,
            scheduled: scheduled.length,
            inProgress: inProgress.length,
            studentsMarkedPresent: presentCount,
            studentsMarkedAbsent: absentCount,
            totalStudentsRecovered: presentCount // Students who recovered = marked present
          }
        }
      })
    )

    // Get students with absences still to recover
    const studentsWithAbsences = await prisma.groupStudent.findMany({
      where: {
        absences: { gt: 0 }
      },
      include: {
        student: true,
        group: {
          include: {
            teacher: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        absences: 'desc'
      }
    })

    // Overall statistics
    const overallStats = {
      totalMakeupLessons: makeupLessons.length,
      completedLessons: makeupLessons.filter(l => l.status === 'COMPLETED').length,
      scheduledLessons: makeupLessons.filter(l => l.status === 'SCHEDULED').length,
      inProgressLessons: makeupLessons.filter(l => l.status === 'IN_PROGRESS').length,
      totalStudentsWithAbsences: studentsWithAbsences.length,
      totalAbsencesToRecover: studentsWithAbsences.reduce((sum, gs) => sum + gs.absences, 0)
    }

    return NextResponse.json({
      makeupLessons,
      teacherStats,
      studentsWithAbsences,
      overallStats
    })
  } catch (error) {
    console.error('Error fetching makeup lessons for admin:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
