import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { markMissedSessionHeld, markMissedSessionNotHeld } from '@/lib/missed-sessions'

/**
 * Lecțiile raportate ca neefectuate, pentru grupele profesorului curent.
 * Profesorul e singurul care știe dacă ora chiar s-a ținut, deci tot el o
 * confirmă sau o infirmă din contul lui.
 */

async function requireTeacher() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  return session.user
}

export async function GET(request) {
  const user = await requireTeacher()
  if (!user) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const includeResolved = searchParams.get('all') === 'true'
  const isAdmin = ['SUPERADMIN', 'ADMIN'].includes(user.role)

  try {
    const missed = await prisma.missedSession.findMany({
      where: {
        ...(isAdmin ? {} : { group: { teacherId: user.id } }),
        ...(includeResolved ? {} : { acknowledged: false }),
      },
      include: {
        group: {
          select: {
            id: true, name: true, level: true,
            _count: { select: { groupStudents: true } },
          },
        },
      },
      orderBy: { scheduledDate: 'desc' },
      take: 60,
    })

    return NextResponse.json({
      missedSessions: missed.map((m) => ({
        id: m.id,
        groupId: m.groupId,
        groupName: m.group.name,
        level: m.group.level,
        studentsCount: m.group._count.groupStudents,
        scheduledDate: m.scheduledDate.toISOString(),
        scheduledDay: m.scheduledDay,
        scheduledTime: m.scheduledTime,
        reason: m.reason,
        acknowledged: m.acknowledged,
      })),
    })
  } catch (e) {
    console.error('Teacher missed sessions GET error:', e)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}

export async function POST(request) {
  const user = await requireTeacher()
  if (!user) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })

  try {
    const { id, held, reason } = await request.json()
    if (!id) return NextResponse.json({ error: 'Lipsește id-ul' }, { status: 400 })

    const missed = await prisma.missedSession.findUnique({
      where: { id },
      include: { group: { select: { teacherId: true } } },
    })
    if (!missed) return NextResponse.json({ error: 'Raportul nu există' }, { status: 404 })

    const isAdmin = ['SUPERADMIN', 'ADMIN'].includes(user.role)
    if (!isAdmin && missed.group.teacherId !== user.id) {
      return NextResponse.json({ error: 'Nu ai acces la această grupă' }, { status: 403 })
    }

    const result = held
      ? await markMissedSessionHeld(missed)
      : await markMissedSessionNotHeld(missed, reason)

    return NextResponse.json({ success: true, held: !!held, ...result })
  } catch (e) {
    console.error('Teacher missed sessions POST error:', e)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}
