import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NOT_COMPLETED } from '@/lib/group-filters'
import { notifyTeacherActivity } from '@/lib/telegram'

// GET - Fetch all groups for this teacher
export async function GET(request) {
  const session = await getServerSession(authOptions)
  
  if (!session || !['TEACHER', 'ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const groups = await prisma.group.findMany({
      where: { teacherId: session.user.id, ...NOT_COMPLETED },
      include: {
        branch: true,
        groupStudents: {
          where: {
            status: { notIn: ['LEFT', 'TRANSFERRED'] }
          },
          include: { student: true }
        }
      },
      orderBy: { name: 'asc' }
    })

    // Get branches
    const branches = await prisma.branch.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    })

    return NextResponse.json({ groups, branches })
  } catch (error) {
    console.error('Error fetching teacher groups:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST - Create a new group (teacher creates their own group)
export async function POST(request) {
  const session = await getServerSession(authOptions)
  
  if (!session || !['TEACHER', 'ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, level, branchId, scheduleDays, scheduleTime, locationType, locationDetails, startDate } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Numele grupei este obligatoriu' }, { status: 400 })
    }

    // Create group with the current teacher as owner
    const group = await prisma.group.create({
      data: {
        name: name.trim(),
        level: level || null,
        teacherId: session.user.id, // Assign to current teacher
        branchId: branchId || null,
        scheduleDays: scheduleDays || [],
        scheduleTime: scheduleTime || null,
        locationType: locationType || 'offline',
        locationDetails: locationDetails || null,
        startDate: startDate ? new Date(startDate) : null,
        active: true
      },
      include: {
        branch: true
      }
    })

    // Send Telegram notification - Thread 9
    const scheduleInfo = scheduleDays?.length > 0 ? scheduleDays.join(', ') : 'Neprecizat'
    const details = `📚 Grupă: <b>${group.name}</b>
📘 Nivel: ${group.level || 'N/A'}
📍 Filiala: ${group.branch?.name || 'Fără filială'}
📅 Program: ${scheduleInfo}${scheduleTime ? ' la ' + scheduleTime : ''}`

    notifyTeacherActivity('group', session.user.name || session.user.email, details)
      .catch(err => console.error('Telegram notification error:', err))

    return NextResponse.json(group, { status: 201 })
  } catch (error) {
    console.error('Error creating group:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
