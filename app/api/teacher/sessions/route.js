import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canStartSession } from '@/lib/schedule-utils'
import { parseSchoolDate } from '@/lib/timezone'

export async function POST(request) {
  const session = await getServerSession(authOptions)
  
  if (!session || !['TEACHER', 'ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { groupId, customDate, notes } = await request.json()

    // Check if user is a super teacher
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true, superTeacher: true }
    })
    const isSuperTeacher = !!currentUser?.superTeacher
    const isAdmin = ['SUPERADMIN', 'ADMIN'].includes(session.user.role)

    // Verify teacher owns this group (unless admin)
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        lessonSessions: {
          orderBy: { date: 'desc' },
          take: 1
        }
      }
    })

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    if (group.teacherId !== session.user.id && !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Determine session date
    let sessionDate = new Date()
    if (customDate && (isSuperTeacher || isAdmin)) {
      const parsed = parseSchoolDate(customDate)
      if (!parsed) {
        return NextResponse.json({ error: 'Dată invalidă' }, { status: 400 })
      }
      sessionDate = parsed
    }

    // Skip "already exists today" check for super teacher / admin (they can create multiple)
    if (!isSuperTeacher && !isAdmin) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const existingSession = await prisma.lessonSession.findFirst({
        where: {
          groupId,
          date: { gte: today, lt: tomorrow }
        }
      })

      if (existingSession) {
        return NextResponse.json({
          error: 'Există deja o sesiune pentru această grupă astăzi'
        }, { status: 400 })
      }
    }

    // Schedule check - butonul "Începe Sesiune Nouă" trebuie să respecte ziua programată
    // pentru TOȚI (inclusiv super teacher, admin direct sau admin impersonând).
    // Bypass-ul se face DOAR când se trimite explicit `customDate` (butonul "Sesiune personalizată"),
    // disponibil numai pentru super teacher / admin.
    const usingCustomDate = !!customDate
    if (!usingCustomDate || !(isSuperTeacher || isAdmin)) {
      const scheduleCheck = canStartSession(group.scheduleDays, group.scheduleTime)
      if (!scheduleCheck.canStart) {
        return NextResponse.json({
          error: scheduleCheck.reason,
          canStart: false,
          nextSessionFormatted: scheduleCheck.nextSessionFormatted
        }, { status: 400 })
      }
    }

    // Create a new lesson session
    const lessonSession = await prisma.lessonSession.create({
      data: {
        groupId,
        date: sessionDate,
        lessonsDeducted: false
      }
    })

    return NextResponse.json(lessonSession, { status: 201 })
  } catch (error) {
    console.error('Error creating session:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function GET(request) {
  const session = await getServerSession(authOptions)
  
  if (!session || !['TEACHER', 'ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const groupId = searchParams.get('groupId')

  try {
    const where = {}
    
    if (groupId) {
      where.groupId = groupId
    }

    // Filter by teacher's groups unless admin
    if (!['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
      where.group = { teacherId: session.user.id }
    }

    const sessions = await prisma.lessonSession.findMany({
      where,
      include: {
        group: {
          include: {}
        },
        attendances: true
      },
      orderBy: { date: 'desc' }
    })

    return NextResponse.json(sessions)
  } catch (error) {
    console.error('Error fetching sessions:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
