import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { checkPermission } from '@/lib/permissions'
import { parseSchoolDate } from '@/lib/timezone'

/**
 * Lecții de probă — evenimente unice, la o dată și oră anume.
 *
 * Nu intră în orarul săptămânal al grupei: o probă se ține o singură dată.
 * Participantul poate fi un lead (încă neconvertit în elev) sau un elev
 * existent, tocmai ca proba să nu ceară crearea unei fișe de elev în avans.
 *
 * Acces: adminii cu groups.view / groups.edit, sau profesorul grupei.
 */

const VALID_STATUSES = ['PROGRAMAT', 'PREZENT', 'ABSENT', 'ANULAT']

async function resolveAccess(groupId = null) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { error: 'Neautentificat', status: 401 }

  const isAdmin = ['SUPERADMIN', 'ADMIN'].includes(session.user.role)

  if (isAdmin) {
    const canView = await checkPermission('groups.view')
    if (!canView.allowed) return { error: 'Nu ai permisiunea să vezi grupele', status: 403 }
    const canEdit = await checkPermission('groups.edit')
    return { user: session.user, isAdmin, canEdit: canEdit.allowed }
  }

  // Profesor: are voie pe grupele lui
  if (groupId) {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { teacherId: true },
    })
    if (!group) return { error: 'Grupa nu există', status: 404 }
    if (group.teacherId !== session.user.id) {
      return { error: 'Nu ai acces la această grupă', status: 403 }
    }
  }

  return { user: session.user, isAdmin: false, canEdit: true }
}

const format = (t) => ({
  id: t.id,
  scheduledAt: t.scheduledAt.toISOString(),
  durationMin: t.durationMin,
  status: t.status,
  notes: t.notes,
  groupId: t.groupId,
  groupName: t.group?.name || null,
  teacherName: t.teacher?.name || null,
  leadId: t.leadId,
  studentId: t.studentId,
  convertedStudentId: t.lead?.convertedStudentId || null,
  leadStatus: t.lead?.status || null,
  participantName:
    t.lead?.studentName || t.lead?.name || t.student?.fullName || 'Necunoscut',
  participantPhone: t.lead?.phone || t.student?.parentPhone || null,
  isLead: !!t.leadId,
})

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const groupId = searchParams.get('groupId')

  const access = await resolveAccess(groupId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  try {
    const where = {}
    if (groupId) where.groupId = groupId
    else if (!access.isAdmin) where.teacherId = access.user.id

    const upcomingOnly = searchParams.get('upcoming') === 'true'
    if (upcomingOnly) {
      where.scheduledAt = { gte: new Date() }
      where.status = 'PROGRAMAT'
    }

    const trials = await prisma.trialLesson.findMany({
      where,
      include: {
        lead: { select: { id: true, name: true, studentName: true, phone: true, convertedStudentId: true, status: true } },
        student: { select: { id: true, fullName: true, parentPhone: true } },
        group: { select: { id: true, name: true } },
        teacher: { select: { name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 100,
    })

    return NextResponse.json({ trials: trials.map(format), canEdit: access.canEdit })
  } catch (e) {
    console.error('Trial lessons GET error:', e)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { groupId, leadId, studentId, scheduledAt, durationMin, notes, teacherId } = body

    const access = await resolveAccess(groupId)
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Nu ai permisiunea necesară' }, { status: 403 })
    }

    if (!leadId && !studentId) {
      return NextResponse.json({ error: 'Alege un lead sau un elev' }, { status: 400 })
    }
    if (!scheduledAt) {
      return NextResponse.json({ error: 'Alege data și ora' }, { status: 400 })
    }
    const when = parseSchoolDate(scheduledAt)
    if (!when) {
      return NextResponse.json({ error: 'Dată invalidă' }, { status: 400 })
    }

    // Profesorul grupei, dacă nu e dat explicit
    let resolvedTeacherId = teacherId || null
    if (!resolvedTeacherId && groupId) {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { teacherId: true },
      })
      resolvedTeacherId = group?.teacherId || null
    }

    const trial = await prisma.trialLesson.create({
      data: {
        groupId: groupId || null,
        leadId: leadId || null,
        studentId: studentId || null,
        teacherId: resolvedTeacherId,
        scheduledAt: when,
        durationMin: parseInt(durationMin, 10) || 60,
        notes: notes?.trim() || null,
        createdById: access.user.id,
      },
      include: {
        lead: { select: { id: true, name: true, studentName: true, phone: true, convertedStudentId: true, status: true } },
        student: { select: { id: true, fullName: true, parentPhone: true } },
        group: { select: { id: true, name: true } },
        teacher: { select: { name: true } },
      },
    })

    return NextResponse.json(format(trial))
  } catch (e) {
    console.error('Trial lessons POST error:', e)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json()
    const { id, status, scheduledAt, notes, durationMin } = body
    if (!id) return NextResponse.json({ error: 'Lipsește id-ul' }, { status: 400 })

    const existing = await prisma.trialLesson.findUnique({
      where: { id },
      select: { groupId: true },
    })
    if (!existing) return NextResponse.json({ error: 'Proba nu există' }, { status: 404 })

    const access = await resolveAccess(existing.groupId)
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Nu ai permisiunea necesară' }, { status: 403 })
    }

    const data = {}
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Status invalid' }, { status: 400 })
      }
      data.status = status
    }
    if (scheduledAt !== undefined) {
      const when = parseSchoolDate(scheduledAt)
      if (!when) return NextResponse.json({ error: 'Dată invalidă' }, { status: 400 })
      data.scheduledAt = when
    }
    if (notes !== undefined) data.notes = notes?.trim() || null
    if (durationMin !== undefined) data.durationMin = parseInt(durationMin, 10) || 60

    const trial = await prisma.trialLesson.update({
      where: { id },
      data,
      include: {
        lead: { select: { id: true, name: true, studentName: true, phone: true, convertedStudentId: true, status: true } },
        student: { select: { id: true, fullName: true, parentPhone: true } },
        group: { select: { id: true, name: true } },
        teacher: { select: { name: true } },
      },
    })

    return NextResponse.json(format(trial))
  } catch (e) {
    console.error('Trial lessons PATCH error:', e)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Lipsește id-ul' }, { status: 400 })

    const existing = await prisma.trialLesson.findUnique({
      where: { id },
      select: { groupId: true },
    })
    if (!existing) return NextResponse.json({ error: 'Proba nu există' }, { status: 404 })

    const access = await resolveAccess(existing.groupId)
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Nu ai permisiunea necesară' }, { status: 403 })
    }

    await prisma.trialLesson.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Trial lessons DELETE error:', e)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}
