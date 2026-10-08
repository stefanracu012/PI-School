/**
 * Corectează recontactările salvate înainte de remedierea fusului orar.
 *
 * Formularele trimiteau ora fără fus („2026-08-18T17:30"), iar serverul —
 * care rulează în UTC — o salva ca 17:30 UTC, adică 20:30 la Chișinău.
 * Scriptul scade 3 ore din valorile afectate.
 *
 * Rulare (întâi fără --apply, ca să vezi ce s-ar schimba):
 *   node scripts/fix-followup-timezone.mjs
 *   node scripts/fix-followup-timezone.mjs --apply
 *
 * Opțional, alt moment de tăiere (implicit: acum):
 *   node scripts/fix-followup-timezone.mjs --before 2026-08-18T15:00:00Z --apply
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const beforeIdx = args.indexOf('--before')
const cutoff = beforeIdx !== -1 && args[beforeIdx + 1]
  ? new Date(args[beforeIdx + 1])
  : new Date()

const OFFSET_HOURS = 3 // Chișinău e UTC+3

const fmt = (d) =>
  new Date(d).toLocaleString('ro-RO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Chisinau',
  })

async function main() {
  if (isNaN(cutoff.getTime())) {
    console.error('❌ Data de tăiere e invalidă')
    process.exit(1)
  }

  const leads = await prisma.lead.findMany({
    where: {
      nextFollowUpAt: { not: null },
      updatedAt: { lt: cutoff },
    },
    select: { id: true, name: true, nextFollowUpAt: true },
    orderBy: { nextFollowUpAt: 'asc' },
  })

  if (leads.length === 0) {
    console.log('✅ Nicio recontactare de corectat.')
    return
  }

  console.log(`📋 ${leads.length} recontactări salvate înainte de ${fmt(cutoff)}:\n`)
  for (const l of leads) {
    const corrected = new Date(l.nextFollowUpAt.getTime() - OFFSET_HOURS * 3600 * 1000)
    console.log(`  ${l.name.padEnd(24)} ${fmt(l.nextFollowUpAt)}  →  ${fmt(corrected)}`)
  }

  if (!apply) {
    console.log('\n🔎 Rulare de probă. Adaugă --apply ca să salvezi modificările.')
    return
  }

  let updated = 0
  for (const l of leads) {
    await prisma.lead.update({
      where: { id: l.id },
      data: {
        nextFollowUpAt: new Date(l.nextFollowUpAt.getTime() - OFFSET_HOURS * 3600 * 1000),
        // lead-ul reintră în coada de notificări, cu ora corectă
        followUpNotifiedAt: null,
      },
    })
    updated++
  }

  console.log(`\n✅ Corectate: ${updated}`)
}

main()
  .catch((e) => {
    console.error('❌ Eroare:', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
