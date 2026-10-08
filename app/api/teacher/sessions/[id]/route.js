import { NextResponse } from 'next/server'
import { guardTeacherAction } from '@/lib/teacher-actions'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyCancelledLesson } from '@/lib/telegram'

// GET - Fetch a specific session
export async function GET(request, { params }) {
  const session = await getServerSession(authOptions)

  if (!session || !['TEACHER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params

    const lessonSession = await prisma.lessonSession.findUnique({
      where: { id },
      include: {
        group: {
          include: {}
        },
        attendances: {
          include: { student: true }
        }
      }
    })

    if (!lessonSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (lessonSession.group.teacherId !== session.user.id && !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json(lessonSession)
  } catch (error) {
    console.error('Error fetching session:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH - Update session notes
export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions)

  if (!session || !['TEACHER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const { notes } = await request.json()

    const lessonSession = await prisma.lessonSession.findUnique({
      where: { id },
      include: { group: true }
    })

    if (!lessonSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (lessonSession.group.teacherId !== session.user.id && !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fereastra se numără de la crearea sesiunii, nu de la data lecției:
    // o lecție înregistrată retroactiv trebuie să poată fi corectată imediat.
    const denied = await guardTeacherAction(NextResponse, 'teacher.session.edit', lessonSession.createdAt)
    if (denied) return denied

    const updatedSession = await prisma.lessonSession.update({
      where: { id },
      data: { notes }
    })

    return NextResponse.json(updatedSession)
  } catch (error) {
    console.error('Error updating session:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - anulează lecția: administrația oricând, profesorul doar cu dreptul
// „Șterge sesiunea" și în fereastra lui de timp.
export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })
  }

  try {
    const { id } = await params

    const lessonSession = await prisma.lessonSession.findUnique({
      where: { id },
      include: {
        group: {
          include: { teacher: true }
        }
      }
    })

    if (!lessonSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (lessonSession.lessonsDeducted) {
      return NextResponse.json({ error: 'Nu se poate șterge o sesiune care a fost deja procesată' }, { status: 400 })
    }

    // Profesorul poate anula doar lecțiile grupei lui
    if (
      !['SUPERADMIN', 'ADMIN'].includes(session.user.role) &&
      lessonSession.group.teacherId !== session.user.id
    ) {
      return NextResponse.json({ error: 'Nu ai acces la această grupă' }, { status: 403 })
    }

    const denied = await guardTeacherAction(NextResponse, 'teacher.session.delete', lessonSession.createdAt)
    if (denied) return denied

    // Notificare Telegram despre anulare
    await notifyCancelledLesson(
      lessonSession.group.name,
      lessonSession.group.teacher.name,
      lessonSession.group.level,
      new Date(lessonSession.date).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' }),
      false
    )

    // Notificare în app pentru admin
    await prisma.notification.create({
      data: {
        type: 'CANCELLED_SESSION',
        title: `🚫 Lecție anulată: ${lessonSession.group.name}`,
        message: `Lecția pentru grupa "${lessonSession.group.name}" (${lessonSession.group.level}) a fost anulată de ${session.user.name}.`,
        link: `/admin/groups/${lessonSession.groupId}`,
        recipientId: null,
        groupId: lessonSession.groupId
      }
    })

    await prisma.lessonSession.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting session:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
