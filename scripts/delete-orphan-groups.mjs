// Șterge grupele orfane (teacherId inexistent) împreună cu toate datele asociate.
// Folosește prisma.group.delete() ca să declanșeze cascadele corect.
// Rulează: node scripts/delete-orphan-groups.mjs            (dry-run, doar afișează)
//          node scripts/delete-orphan-groups.mjs --confirm  (șterge efectiv)

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const confirm = process.argv.includes('--confirm')

  const users = await prisma.user.findMany({ select: { id: true } })
  const validIds = new Set(users.map(u => u.id))

  const groups = await prisma.group.findMany({
    select: { id: true, name: true, teacherId: true, active: true }
  })
  const orphanGroups = groups.filter(g => !validIds.has(g.teacherId))

  if (orphanGroups.length === 0) {
    console.log('✅ Nu există grupe orfane.')
    await prisma.$disconnect()
    return
  }

  console.log(`🔍 Grupe orfane găsite: ${orphanGroups.length}`)
  for (const g of orphanGroups) {
    const [studentsCount, sessionsCount, makeupsCount, attendanceCount, transactionsCount, missedCount] = await Promise.all([
      prisma.groupStudent.count({ where: { groupId: g.id } }),
      prisma.lessonSession.count({ where: { groupId: g.id } }),
      prisma.makeupLesson.count({ where: { groupId: g.id } }),
      prisma.attendance.count({ where: { session: { groupId: g.id } } }),
      prisma.lessonTransaction.count({ where: { groupId: g.id } }),
      prisma.missedSession.count({ where: { groupId: g.id } }),
    ])
    console.log(`\n  📚 "${g.name}" (id=${g.id})`)
    console.log(`     - groupStudents:      ${studentsCount}`)
    console.log(`     - lessonSessions:     ${sessionsCount}`)
    console.log(`     - attendances:        ${attendanceCount}`)
    console.log(`     - makeupLessons:      ${makeupsCount}`)
    console.log(`     - lessonTransactions: ${transactionsCount}`)
    console.log(`     - missedSessions:     ${missedCount}`)
  }

  if (!confirm) {
    console.log('\n⚠️  DRY-RUN. Pentru a șterge efectiv, rulează:')
    console.log('     node scripts/delete-orphan-groups.mjs --confirm')
    await prisma.$disconnect()
    return
  }

  console.log('\n🗑️  Se șterg grupele...')
  for (const g of orphanGroups) {
    await prisma.group.delete({ where: { id: g.id } })
    console.log(`   ✅ "${g.name}" ștearsă (cascade aplicate)`)
  }

  console.log(`\n✅ Done. Șterse: ${orphanGroups.length} grupe orfane.`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
