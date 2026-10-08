import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { guardTeacherAction } from '@/lib/teacher-actions'
import { notifyCancelledLesson } from '@/lib/telegram'
import {
  loadSessionWithAccounting,
  applyAttendanceChange,
  reverseSessionAccounting,
} from '@/lib/session-corrections'
import { syncSessionSalary, removeSourceSalary } from '@/lib/salary'

/**
 * Corectarea unei lecții deja înregistrate, din panoul administrației.
 * Aceeași rută servește și profesorul, pe grupele lui — regulile de acces
 * și de contabilitate sunt identice, doar fereastra de timp diferă
 * (guardTeacherAction).
 */

async function loadSession(id) {
  return loadSessionWithAccounting(id)
}

// PATCH — data, notițele și prezența
export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions)
  if (!session || !['SUPERADMIN', 'ADMIN', 'TEACHER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()

    const lessonSession = await loadSession(id)
    if (!lessonSession) {
      return NextResponse.json({ error: 'Sesiunea nu există' }, { status: 404 })
    }

    // Profesorul umblă doar la grupele lui
    if (
      !['SUPERADMIN', 'ADMIN'].includes(session.user.role) &&
      lessonSession.group.teacherId !== session.user.id
    ) {
      return NextResponse.json({ error: 'Nu ai acces la această grupă' }, { status: 403 })
    }

    const denied = await guardTeacherAction(NextResponse, 'teacher.session.edit', lessonSession.createdAt)
    if (denied) return denied

    // Prezențele, una câte una, cu contabilitatea la zi
    if (Array.isArray(body.attendances)) {
      for (const change of body.attendances) {
        const current = lessonSession.attendances.find((a) => a.id === change.id)
        if (!current) continue

        const nextStatus = change.status === 'PRESENT' ? 'PRESENT' : 'ABSENT'

        // Cifrele se mișcă doar dacă lecția fusese deja procesată; altfel
        // deducerea de mai târziu va citi statusul corect oricum.
        if (lessonSession.lessonsDeducted) {
          await applyAttendanceChange(lessonSession, current, nextStatus)
        }

        await prisma.attendance.update({
          where: { id: current.id },
          data: {
            status: nextStatus,
            ...(change.notes !== undefined ? { notes: change.notes || null } : {}),
          },
        })
      }
    }

    const data = {}
    if (body.notes !== undefined) data.notes = body.notes || null
    if (body.date) {
      const parsed = new Date(body.date)
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Data nu e validă' }, { status: 400 })
      }
      data.date = parsed
    }

    if (Object.keys(data).length > 0) {
      await prisma.lessonSession.update({ where: { id }, data })
    }

    // La plata pe elev prezent, prezența corectată schimbă și suma din salariu
    if (lessonSession.lessonsDeducted) {
      await syncSessionSalary(id)
    }

    return NextResponse.json({ success: true, session: await loadSession(id) })
  } catch (error) {
    console.error('Eroare la corectarea sesiunii:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE — șterge lecția și dă înapoi ce s-a scăzut pentru ea
export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })
  }

  try {
    const { id } = await params
    const lessonSession = await loadSession(id)
    if (!lessonSession) {
      return NextResponse.json({ error: 'Sesiunea nu există' }, { status: 404 })
    }

    if (
      !['SUPERADMIN', 'ADMIN'].includes(session.user.role) &&
      lessonSession.group.teacherId !== session.user.id
    ) {
      return NextResponse.json({ error: 'Nu ai acces la această grupă' }, { status: 403 })
    }

    const denied = await guardTeacherAction(NextResponse, 'teacher.session.delete', lessonSession.createdAt)
    if (denied) return denied

    // Lecția procesată se desface înainte de ștergere: orele se întorc în
    // pachete, absențele se scad.
    await reverseSessionAccounting(lessonSession)
    await removeSourceSalary({ sessionId: id }, session.user.name)

    await notifyCancelledLesson(
      lessonSession.group.name,
      lessonSession.group.teacher?.name || '—',
      lessonSession.group.level,
      new Date(lessonSession.date).toLocaleTimeString('ro-RO', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest',
      }),
      false
    ).catch(() => {})

    await prisma.notification.create({
      data: {
        type: 'CANCELLED_SESSION',
        title: `🚫 Lecție ștearsă: ${lessonSession.group.name}`,
        message:
          `Lecția din ${new Date(lessonSession.date).toLocaleDateString('ro-RO')} ` +
          `(grupa „${lessonSession.group.name}") a fost ștearsă de ${session.user.name}.`,
        link: `/admin/groups/${lessonSession.groupId}`,
        recipientId: null,
        groupId: lessonSession.groupId,
      },
    }).catch(() => {})

    await prisma.lessonSession.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Eroare la ștergerea sesiunii:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
