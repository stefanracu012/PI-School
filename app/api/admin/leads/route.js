import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPermission } from '@/lib/permissions'
import { ageRange } from '@/lib/age-groups'
import { inboxLink } from '@/lib/meta-messages'
import { LEAD_STATUS_VALUES, LEAD_SOURCE_VALUES } from '@/lib/leads-config'
import { notifyLeadAssigned } from '@/lib/telegram'
import { parseSchoolDate } from '@/lib/timezone'
import { normalizeChildren, mirrorOfFirstChild, childrenOf } from '@/lib/lead-children'

/**
 * Câmpurile legate de „cine învață", din ce a trimis formularul.
 *
 * Formularul nou trimite `children`; cel vechi (și integrările) trimit
 * câmpurile singulare. Oricare ar fi, salvăm și lista, și oglinda primului
 * copil — ca filtrele și statisticile de dinainte să meargă neatinse.
 */
function childFields(data) {
  const children = normalizeChildren(data.children)

  if (children.length > 0) {
    return { children, ...mirrorOfFirstChild(children) }
  }

  return {
    children: [],
    studentName: data.studentName?.trim() || null,
    studentAge: data.isAdult ? null : (data.studentAge ? parseInt(data.studentAge) : null),
    isAdult: !!data.isAdult,
    interestedIn: data.interestedIn?.trim() || null,
    lessonType: data.lessonType || null,
    locationType: data.locationType || null,
  }
}

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

// GET /api/admin/leads — listare cu filtre
export async function GET(request) {
  const { error } = await requireStaff('leads.view')
  if (error) return error

  try {
    const { searchParams } = new URL(request.url)
    const where = {}

    // Status: acceptă valori multiple, separate prin virgulă
    const status = searchParams.get('status')
    if (status) {
      const list = status.split(',').filter((s) => LEAD_STATUS_VALUES.includes(s))
      if (list.length) where.status = { in: list }
    }

    // Sursă: idem
    const source = searchParams.get('source')
    if (source) {
      const list = source.split(',').filter((s) => LEAD_SOURCE_VALUES.includes(s))
      if (list.length) where.source = { in: list }
    }

    // Interval de creare
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(from)
      if (to) {
        const end = new Date(to)
        end.setHours(23, 59, 59, 999)
        where.createdAt.lte = end
      }
    }

    // Follow-up: „due" = programat până azi inclusiv; „none" = fără follow-up
    const followUp = searchParams.get('followUp')
    if (followUp === 'overdue') {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      where.nextFollowUpAt = { not: null, lt: start }
    } else if (followUp === 'today') {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      where.nextFollowUpAt = { gte: start, lt: end }
    } else if (followUp === 'due') {
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      where.nextFollowUpAt = { not: null, lte: end }
    } else if (followUp === 'upcoming') {
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      where.nextFollowUpAt = { gt: end }
    } else if (followUp === 'none') {
      where.nextFollowUpAt = null
    }

    // Nivel: „none" = lead-urile fără nivel completat
    const level = searchParams.get('level')
    if (level === 'none') where.interestedIn = null
    else if (level) where.interestedIn = level

    // Online sau la sediu
    const locationType = searchParams.get('locationType')
    if (locationType) where.locationType = locationType

    // În grupă sau individual
    const lessonType = searchParams.get('lessonType')
    if (lessonType) where.lessonType = lessonType

    // Adult sau copil
    const audience = searchParams.get('audience')
    if (audience === 'adult') where.isAdult = true
    else if (audience === 'copil') where.isAdult = false

    // Categorie de vârstă, din vârsta elevului
    // Vârsta se caută prin toți copiii lead-ului, nu doar prin primul:
    // un părinte poate întreba pentru un copil de 5 ani și unul de 10.
    const ageGroup = searchParams.get('ageGroup')
    if (ageGroup === 'adulti') {
      where.OR = [
        ...(where.OR || []),
        { isAdult: true },
        { studentAge: ageRange('adulti') },
        { children: { some: { isAdult: true } } },
        { children: { some: { age: ageRange('adulti') } } },
      ]
    } else if (ageGroup) {
      const range = ageRange(ageGroup)
      if (range) {
        where.OR = [
          ...(where.OR || []),
          { AND: [{ studentAge: range }, { isAdult: false }] },
          { children: { some: { AND: [{ age: range }, { isAdult: false }] } } },
        ]
      }
    }

    // Perioadă, cu denumiri, nu cu numere de zile: „ieri" înseamnă chiar
    // ziua de ieri, nu ultimele 24 de ore.
    const period = searchParams.get('period')
    if (period) {
      const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
      const today = startOfDay(new Date())
      const range = {}

      if (period === 'today') {
        range.gte = today
      } else if (period === 'yesterday') {
        const y = new Date(today); y.setDate(y.getDate() - 1)
        range.gte = y
        range.lt = today
      } else if (period === 'week') {
        // Săptămâna începe luni, ca în orar
        const monday = new Date(today)
        const shift = (monday.getDay() + 6) % 7
        monday.setDate(monday.getDate() - shift)
        range.gte = monday
      } else if (period === 'month') {
        range.gte = new Date(today.getFullYear(), today.getMonth(), 1)
      } else if (period === 'prev-month') {
        range.gte = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        range.lt = new Date(today.getFullYear(), today.getMonth(), 1)
      } else if (/^[0-9]+$/.test(period)) {
        const limit = new Date(today)
        limit.setDate(limit.getDate() - parseInt(period, 10))
        range.gte = limit
      }

      if (Object.keys(range).length > 0) {
        where.createdAt = { ...(where.createdAt || {}), ...range }
      }
    }

    // Căutare liberă
    const q = searchParams.get('q')?.trim()
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { message: { contains: q, mode: 'insensitive' } },
        { studentName: { contains: q, mode: 'insensitive' } },
        { sourceDetail: { contains: q, mode: 'insensitive' } },
      ]
    }

    const sort = searchParams.get('sort') || 'newest'
    const orderBy =
      sort === 'oldest' ? { createdAt: 'asc' }
      : sort === 'followup' ? { nextFollowUpAt: 'asc' }
      : sort === 'name' ? { name: 'asc' }
      : { createdAt: 'desc' }

    // „all" aduce tot ce trece de filtre; altfel, o pagină
    const rawSize = searchParams.get('pageSize') || '50'
    const all = rawSize === 'all'
    const pageSize = all ? null : Math.min(Math.max(parseInt(rawSize, 10) || 50, 5), 500)
    const page = Math.max(parseInt(searchParams.get('page'), 10) || 1, 1)

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const [leads, totalCount, byStatusRaw, byLevelRaw, overdue, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy,
        ...(all ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
        include: {
          createdBy: { select: { name: true, email: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
          _count: { select: { leadNotes: true } },
        },
      }),
      prisma.lead.count({ where }),
      // Cifrele de sus se numără pe toate lead-urile, nu pe pagina curentă
      prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.lead.groupBy({ by: ['interestedIn'], _count: { _all: true } }),
      prisma.lead.count({
        where: {
          nextFollowUpAt: { not: null, lt: startOfToday },
          status: { notIn: ['PLATIT', 'STUDIAZA', 'PLECAT', 'LOST_LEAD'] },
        },
      }),
      prisma.lead.count(),
    ])

    const byStatus = {}
    for (const row of byStatusRaw) byStatus[row.status] = row._count._all

    const levelOptions = byLevelRaw
      .filter((row) => row.interestedIn)
      .map((row) => ({ value: row.interestedIn, count: row._count._all }))
      .sort((a, b) => a.value.localeCompare(b.value, 'ro'))
    const withoutLevel = byLevelRaw.find((row) => !row.interestedIn)?._count._all || 0

    // Aceeași formă pe care o aștepta pagina când datele veneau din server
    const formatted = leads.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      source: l.source,
      sourceDetail: l.sourceDetail,
      message: l.message,
      studentName: l.studentName,
      studentAge: l.studentAge,
      isAdult: l.isAdult,
      interestedIn: l.interestedIn,
      lessonType: l.lessonType || null,
      locationType: l.locationType || null,
      children: childrenOf(l),
      status: l.status,
      nextFollowUpAt: l.nextFollowUpAt ? l.nextFollowUpAt.toISOString() : null,
      createdAt: l.createdAt.toISOString(),
      createdByName: l.createdBy?.name || l.createdBy?.email || null,
      assignedToId: l.assignedToId || null,
      assignedToName: l.assignedTo?.name || l.assignedTo?.email || null,
      notesCount: l._count.leadNotes,
      metaConversationId: l.metaConversationId || null,
      metaPlatform: l.metaPlatform || null,
      metaPersonId: l.metaPersonId || null,
      metaInboxUrl: inboxLink(l.metaPersonId, l.metaPlatform, l.metaConversationId),
    }))

    return NextResponse.json({
      leads: formatted,
      page: all ? 1 : page,
      pageSize: all ? totalCount : pageSize,
      totalCount,
      totalPages: all ? 1 : Math.max(Math.ceil(totalCount / pageSize), 1),
      stats: { total, byStatus, overdue },
      levelOptions,
      withoutLevel,
    })
  } catch (e) {
    console.error('Leads GET error:', e)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}

// POST /api/admin/leads — lead nou, adăugat manual de staff
export async function POST(request) {
  const { session, error } = await requireStaff('leads.create')
  if (error) return error

  try {
    const data = await request.json()

    if (!data.name?.trim()) {
      return NextResponse.json({ error: 'Numele este obligatoriu' }, { status: 400 })
    }
    if (data.source && !LEAD_SOURCE_VALUES.includes(data.source)) {
      return NextResponse.json({ error: 'Sursă invalidă' }, { status: 400 })
    }
    if (data.status && !LEAD_STATUS_VALUES.includes(data.status)) {
      return NextResponse.json({ error: 'Status invalid' }, { status: 400 })
    }

    // Un lead venit din Messenger/Instagram păstrează legătura cu conversația
    const fromConversation = !!data.metaConversationId

    const lead = await prisma.lead.create({
      data: {
        name: data.name.trim(),
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        source: data.source || 'ALTA',
        sourceDetail: data.sourceDetail?.trim() || null,
        message: data.message?.trim() || null,
        ...childFields(data),
        status: data.status || 'LEAD',
        nextFollowUpAt: parseSchoolDate(data.nextFollowUpAt),
        assignedToId: data.assignedToId || null,
        createdById: session.user.id,
        ...(fromConversation ? {
          metaConversationId: data.metaConversationId,
          metaPlatform: data.metaPlatform === 'instagram' ? 'instagram' : 'messenger',
          metaPersonId: data.metaPersonId || null,
          metaLastMessageAt: new Date(),
        } : {}),
      },
    })

    // Notificarea nu trebuie să blocheze răspunsul; numele se rezolvă separat,
    // ca mesajul să conțină responsabilul și autorul, nu doar id-uri.
    ;(async () => {
      const [assignedTo, createdBy] = await Promise.all([
        lead.assignedToId
          ? prisma.user.findUnique({
              where: { id: lead.assignedToId },
              select: { name: true, email: true, telegramChatId: true },
            })
          : null,
        prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true } }),
      ])

      const enriched = {
        ...lead,
        assignedToName: assignedTo?.name || assignedTo?.email || null,
        createdByName: createdBy?.name || createdBy?.email || null,
      }

      // Doar responsabilului, în privat. Topicul comun primește dimineața
      // digestul de recontactări — lead-ul proaspăt îl știe deja cine l-a scris.
      if (assignedTo?.telegramChatId) {
        await notifyLeadAssigned(enriched, { chatId: assignedTo.telegramChatId })
      }
    })().catch((err) => console.error('Telegram lead notify:', err))

    return NextResponse.json(lead, { status: 201 })
  } catch (e) {
    console.error('Leads POST error:', e)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}
