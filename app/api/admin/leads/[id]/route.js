import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPermission } from '@/lib/permissions'
import { LEAD_STATUS_VALUES, LEAD_SOURCE_VALUES } from '@/lib/leads-config'
import { convertLeadToStudent, isWonStatus } from '@/lib/lead-conversion'
import { parseSchoolDate } from '@/lib/timezone'
import { normalizeChildren, mirrorOfFirstChild } from '@/lib/lead-children'
import { notifyLeadAssigned } from '@/lib/telegram'

async function requireStaff(permission) {
  const session = await getServerSession(authOptions)
  if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const perm = await checkPermission(permission)
  if (!perm.allowed) {
    return { error: NextResponse.json({ error: 'Nu ai permisiunea necesară' }, { status: 403 }) }
  }
  return { session }
}

export async function GET(request, { params }) {
  const { error } = await requireStaff('leads.view')
  if (error) return error

  const { id } = await params
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: { leadNotes: { orderBy: { createdAt: 'desc' } } },
  })
  if (!lead) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 })
  return NextResponse.json(lead)
}

export async function PATCH(request, { params }) {
  const { error } = await requireStaff('leads.edit')
  if (error) return error

  try {
    const { id } = await params
    const data = await request.json()
    const update = {}

    const previous = await prisma.lead.findUnique({
      where: { id },
      select: { assignedToId: true, status: true },
    })
    if (!previous) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 })

    // Formularul retrimite statusul curent; unul scos din uz (ex. PROGRAMAT)
    // trebuie să treacă neschimbat, altfel restul modificărilor se pierd.
    if (data.status !== undefined && data.status !== previous.status) {
      if (!LEAD_STATUS_VALUES.includes(data.status)) {
        return NextResponse.json({ error: 'Status invalid' }, { status: 400 })
      }
      update.status = data.status
    }
    if (data.source !== undefined) {
      if (!LEAD_SOURCE_VALUES.includes(data.source)) {
        return NextResponse.json({ error: 'Sursă invalidă' }, { status: 400 })
      }
      update.source = data.source
    }

    // Câmpuri text: șirul gol înseamnă „golește câmpul"
    for (const f of ['name', 'phone', 'email', 'sourceDetail', 'message', 'studentName', 'interestedIn', 'lessonType', 'locationType']) {
      if (data[f] !== undefined) update[f] = data[f]?.trim() || null
    }
    if (data.name !== undefined && !update.name) {
      return NextResponse.json({ error: 'Numele nu poate fi gol' }, { status: 400 })
    }
    if (data.isAdult !== undefined) {
      update.isAdult = !!data.isAdult
      if (data.isAdult) update.studentAge = null
    }
    if (data.studentAge !== undefined && !data.isAdult) {
      const age = parseInt(data.studentAge, 10)
      update.studentAge = Number.isFinite(age) ? age : null
    }

    // Lista de copii înlocuiește tot ce ținea un singur elev: salvăm lista
    // și oglindim primul copil în câmpurile vechi, ca filtrele și
    // statisticile scrise înainte să meargă mai departe.
    if (data.children !== undefined) {
      const children = normalizeChildren(data.children)
      update.children = children
      const mirror = mirrorOfFirstChild(children)
      // Fără copii: contactul învață chiar el — vârsta, nivelul și preferințele
      // lui vin în câmpurile singulare, tratate mai sus; nu le ștergem.
      if (mirror) Object.assign(update, mirror)
      else update.studentName = null
    }
    if (data.nextFollowUpAt !== undefined) {
      update.nextFollowUpAt = parseSchoolDate(data.nextFollowUpAt)
      // Data schimbată → lead-ul reintră în coada de notificări
      update.followUpNotifiedAt = null
    }
    if (data.assignedToId !== undefined) {
      update.assignedToId = data.assignedToId || null
    }
    if (data.convertedStudentId !== undefined) {
      update.convertedStudentId = data.convertedStudentId || null
    }

    const lead = await prisma.lead.update({ where: { id }, data: update })

    // Responsabil nou → primește lead-ul în privat, dacă are Telegram conectat
    if (lead.assignedToId && lead.assignedToId !== previous?.assignedToId) {
      prisma.user
        .findUnique({
          where: { id: lead.assignedToId },
          select: { name: true, email: true, telegramChatId: true },
        })
        .then((owner) => {
          if (!owner?.telegramChatId) return
          return notifyLeadAssigned(
            { ...lead, assignedToName: owner.name || owner.email || null },
            { chatId: owner.telegramChatId, isNew: false }
          )
        })
        .catch((err) => console.error('Telegram lead assign notify:', err))
    }

    // Lead câștigat → elevul apare automat în lista de elevi (o singură dată)
    let conversion = null
    if (isWonStatus(lead.status) && !lead.convertedStudentId && !lead.convertedStudentIds?.length) {
      conversion = await convertLeadToStudent(lead)
    }

    return NextResponse.json({ ...lead, conversion })
  } catch (e) {
    console.error('Lead PATCH error:', e)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  const { error } = await requireStaff('leads.delete')
  if (error) return error

  try {
    const { id } = await params
    await prisma.leadNote.deleteMany({ where: { leadId: id } })
    await prisma.lead.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Lead DELETE error:', e)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}
