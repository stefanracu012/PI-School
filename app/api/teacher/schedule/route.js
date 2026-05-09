import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// Endpoint pentru orarul complet - accesibil tuturor utilizatorilor autentificați
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get valid teacher IDs to skip orphan groups (teacher deleted directly from DB)
    const validTeachers = await prisma.user.findMany({ select: { id: true } })
    const validTeacherIds = validTeachers.map(t => t.id)

    // Fetch all active groups with necessary relations
    const groups = await prisma.group.findMany({
      where: { 
        active: true,
        teacherId: { in: validTeacherIds }
      },
      include: {
        course: { select: { id: true, title: true } },
        branch: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true, email: true } },
        groupStudents: {
          where: { status: { notIn: ['LEFT', 'TRANSFERRED'] } },
          select: { id: true, status: true }
        }
      },
      orderBy: { name: 'asc' }
    })

    // Fetch all teachers for filter
    const teachers = await prisma.user.findMany({
      where: { 
        role: 'TEACHER',
        active: true
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' }
    })

    // Fetch all branches for filter
    const branches = await prisma.branch.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    })
    
    // Fetch scheduled makeup lessons (SCHEDULED or IN_PROGRESS) with valid teachers only
    const makeupLessons = await prisma.makeupLesson.findMany({
      where: {
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        teacherId: { in: validTeacherIds }
      },
      include: {
        group: { 
          select: { id: true, name: true } 
        },
        branch: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true, email: true } },
        students: {
          include: {
            student: { select: { id: true, fullName: true } }
          }
        }
      },
      orderBy: { scheduledAt: 'asc' }
    })

    return NextResponse.json({ 
      groups,
      teachers,
      branches,
      makeupLessons,
      currentUserId: session.user.id
    })
  } catch (error) {
    console.error('Error fetching schedule:', error)
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 })
  }
}
