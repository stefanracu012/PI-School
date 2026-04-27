// Găsește grupe și recuperări fără profesor (după ștergere directă din MongoDB)
// Rulează: node scripts/find-orphan-groups.mjs

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔍 Caut grupe orfane (fără profesor valid)...\n')

  // 1. Toți userii valizi
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true } })
  const validIds = new Set(users.map(u => u.id))

  console.log(`👥 Useri în DB: ${users.length}`)
  users.forEach(u => console.log(`   - ${u.name || '(fără nume)'} <${u.email}> [${u.role}] id=${u.id}`))

  // 2. Grupe orfane
  const groups = await prisma.group.findMany({ select: { id: true, name: true, teacherId: true, active: true } })
  const orphanGroups = groups.filter(g => !validIds.has(g.teacherId))

  console.log(`\n📚 Grupe totale: ${groups.length}`)
  console.log(`❌ Grupe ORFANE (teacherId inexistent): ${orphanGroups.length}`)
  orphanGroups.forEach(g => {
    console.log(`   - "${g.name}" (active=${g.active}) → teacherId=${g.teacherId} (DISPĂRUT)`)
    console.log(`     groupId=${g.id}`)
  })

  // 3. Recuperări orfane
  const makeups = await prisma.makeupLesson.findMany({ select: { id: true, teacherId: true, scheduledAt: true, status: true } })
  const orphanMakeups = makeups.filter(m => !validIds.has(m.teacherId))

  console.log(`\n🔁 Recuperări totale: ${makeups.length}`)
  console.log(`❌ Recuperări ORFANE: ${orphanMakeups.length}`)
  orphanMakeups.forEach(m => {
    console.log(`   - ${m.scheduledAt.toISOString()} status=${m.status} teacherId=${m.teacherId}`)
    console.log(`     makeupId=${m.id}`)
  })

  console.log('\n✅ Gata. Folosește scripts/fix-orphan-groups.mjs ca să le repari.')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
