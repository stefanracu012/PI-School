// Reasignează grupele și recuperările orfane unui profesor valid
// Rulează: node scripts/fix-orphan-groups.mjs <NEW_TEACHER_ID>
// Ex:      node scripts/fix-orphan-groups.mjs 67abc123def456...

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const newTeacherId = process.argv[2]
  if (!newTeacherId) {
    console.error('❌ Lipsește NEW_TEACHER_ID.')
    console.error('   Folosire: node scripts/fix-orphan-groups.mjs <userId>')
    process.exit(1)
  }

  // Verifică că noul profesor există
  const newTeacher = await prisma.user.findUnique({ where: { id: newTeacherId } })
  if (!newTeacher) {
    console.error(`❌ Userul cu id=${newTeacherId} nu există.`)
    process.exit(1)
  }

  console.log(`✅ Voi reasigna totul către: ${newTeacher.name} <${newTeacher.email}> [${newTeacher.role}]\n`)

  const users = await prisma.user.findMany({ select: { id: true } })
  const validIds = new Set(users.map(u => u.id))

  // Grupe orfane
  const groups = await prisma.group.findMany({ select: { id: true, name: true, teacherId: true } })
  const orphanGroups = groups.filter(g => !validIds.has(g.teacherId))

  for (const g of orphanGroups) {
    await prisma.group.update({ where: { id: g.id }, data: { teacherId: newTeacherId } })
    console.log(`   ✏️  Grupă "${g.name}" reasignată`)
  }

  // Makeup orfane
  const makeups = await prisma.makeupLesson.findMany({ select: { id: true, teacherId: true } })
  const orphanMakeups = makeups.filter(m => !validIds.has(m.teacherId))

  for (const m of orphanMakeups) {
    await prisma.makeupLesson.update({ where: { id: m.id }, data: { teacherId: newTeacherId } })
    console.log(`   ✏️  Makeup ${m.id} reasignat`)
  }

  console.log(`\n✅ Total reparat: ${orphanGroups.length} grupe + ${orphanMakeups.length} recuperări`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
