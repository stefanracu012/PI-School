import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * Corectează recontactările salvate înainte de remedierea fusului orar.
 *
 * Valorile vechi au fost scrise ca „ora aleasă, dar în UTC", deci apar cu 3 ore
 * mai târziu. Endpoint-ul scade decalajul, ca lead-urile să devină scadente la
 * ora corectă.
 *
 * Deschis din browser, logat ca admin:
 *   /api/admin/leads/fix-timezone            → doar arată ce s-ar schimba
 *   /api/admin/leads/fix-timezone?apply=1    → aplică
 */

const OFFSET_HOURS = 3

const fmt = (d) =>
  new Date(d).toLocaleString('ro-RO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Chisinau',
  })

export async function GET(request) {
  const session = await getServerSession(authOptions)
  if (!['SUPERADMIN', 'ADMIN'].includes(session?.user?.role)) {
    return NextResponse.json({ error: 'Neautorizat' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const apply = searchParams.get('apply') === '1'
  const before = searchParams.get('before') ? new Date(searchParams.get('before')) : new Date()

  if (isNaN(before.getTime())) {
    return NextResponse.json({ error: 'Parametrul „before" e invalid' }, { status: 400 })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: { nextFollowUpAt: { not: null }, updatedAt: { lt: before } },
      select: { id: true, name: true, nextFollowUpAt: true },
      orderBy: { nextFollowUpAt: 'asc' },
    })

    const changes = leads.map((l) => ({
      id: l.id,
      name: l.name,
      inainte: fmt(l.nextFollowUpAt),
      dupa: fmt(new Date(l.nextFollowUpAt.getTime() - OFFSET_HOURS * 3600 * 1000)),
    }))

    if (!apply) {
      return NextResponse.json({
        mod: 'previzualizare',
        gasite: changes.length,
        schimbari: changes,
        hint: 'Adaugă ?apply=1 în URL ca să salvezi corecțiile',
      })
    }

    for (const l of leads) {
      await prisma.lead.update({
        where: { id: l.id },
        data: {
          nextFollowUpAt: new Date(l.nextFollowUpAt.getTime() - OFFSET_HOURS * 3600 * 1000),
          followUpNotifiedAt: null, // reintră în coada de notificări, la ora corectă
        },
      })
    }

    return NextResponse.json({ mod: 'aplicat', corectate: changes.length, schimbari: changes })
  } catch (e) {
    console.error('Fix timezone error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
