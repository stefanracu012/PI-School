import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { notifyLeadFollowUps, notifyLeadReminder } from '@/lib/telegram'

/**
 * Cron dedicat recontactărilor de leads, rulat des (la 10 minute).
 *
 * E separat de cron-ul zilnic tocmai ca să rămână ieftin: o singură
 * interogare pe un câmp indexat (nextFollowUpAt), care de cele mai multe ori
 * întoarce zero rânduri. Follow-up-ul are acum și oră, nu doar zi.
 *
 * followUpNotifiedAt oprește retrimiterea: un lead e anunțat o singură dată
 * pentru o dată de recontactare, până când data e schimbată.
 */

export const dynamic = 'force-dynamic'

// Statusuri închise — nu mai au rost recontactările
const CLOSED_LEAD_STATUSES = ['PLATIT', 'STUDIAZA', 'PLECAT', 'LOST_LEAD']

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  const fromCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

  // Un admin logat poate rula verificarea manual, ca să vadă imediat rezultatul
  let manualRun = false
  if (!fromCron) {
    const session = await getServerSession(authOptions)
    manualRun = ['SUPERADMIN', 'ADMIN'].includes(session?.user?.role)
    if (!manualRun && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const now = new Date()

    const due = await prisma.lead.findMany({
      where: {
        nextFollowUpAt: { not: null, lte: now },
        status: { notIn: CLOSED_LEAD_STATUSES },
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true, telegramChatId: true } },
      },
      orderBy: { nextFollowUpAt: 'asc' },
      take: 100,
    })

    // Anunțăm o singură dată per dată de recontactare; dacă data e mutată mai
    // târziu, followUpNotifiedAt rămâne în urmă și lead-ul reintră în listă.
    const pending = due.filter(
      (l) => !l.followUpNotifiedAt || l.followUpNotifiedAt < l.nextFollowUpAt
    )

    if (pending.length === 0) {
      return NextResponse.json({
        success: true,
        notified: 0,
        checked: due.length,
        trigger: fromCron ? 'cron' : 'manual',
        timestamp: now.toISOString(),
      })
    }

    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)

    const items = pending.map((lead) => {
      const dueDate = new Date(lead.nextFollowUpAt)
      dueDate.setHours(0, 0, 0, 0)
      return { lead, daysOverdue: Math.round((startOfDay - dueDate) / 86400000) }
    })

    // 1. Digest în topicul comun de lead-uri
    const digestSent = await notifyLeadFollowUps(items)

    // 2. Reminder complet, cu butoane, către responsabilul fiecărui lead
    const owners = new Set()
    let directMessages = 0

    for (const { lead, daysOverdue } of items) {
      if (!lead.assignedTo?.telegramChatId) continue
      owners.add(lead.assignedTo.id)

      const sent = await notifyLeadReminder(
        {
          ...lead,
          assignedToName: lead.assignedTo.name || lead.assignedTo.email || null,
        },
        { chatId: lead.assignedTo.telegramChatId, daysOverdue }
      )
      if (sent) directMessages++
    }

    // 3. Notificare în aplicație (clopoțelul din admin), pentru fiecare lead:
    //    către responsabil dacă există, altfel către toți adminii
    await prisma.notification.createMany({
      data: items.map(({ lead, daysOverdue }) => ({
        type: 'LEAD_FOLLOWUP',
        title: daysOverdue > 0
          ? `🔴 Recontactare restantă: ${lead.name}`
          : `🔔 De recontactat azi: ${lead.name}`,
        message: [
          lead.phone ? `Telefon: ${lead.phone}` : null,
          daysOverdue > 0 ? `Restant de ${daysOverdue} ${daysOverdue === 1 ? 'zi' : 'zile'}` : null,
        ].filter(Boolean).join(' · ') || 'Lead de recontactat',
        link: `/admin/leads/${lead.id}`,
        recipientId: lead.assignedToId || null,
        data: { leadId: lead.id, daysOverdue },
      })),
    })

    // 4. Marcăm ca anunțate, ca să nu se repete la următoarea rulare
    await prisma.lead.updateMany({
      where: { id: { in: pending.map((l) => l.id) } },
      data: { followUpNotifiedAt: now },
    })

    return NextResponse.json({
      success: true,
      notified: pending.length,
      digestSent: !!digestSent,
      directMessages,
      owners: owners.size,
      withoutTelegram: pending.filter((l) => l.assignedTo && !l.assignedTo.telegramChatId).length,
      trigger: fromCron ? 'cron' : 'manual',
      timestamp: now.toISOString(),
    })
  } catch (error) {
    console.error('Lead follow-up cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
