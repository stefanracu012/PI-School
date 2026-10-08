/**
 * Seed inițial pentru CRM-ul PI School.
 *
 *   npm run db:seed
 *
 * Creează: 1 superadmin, 1 profesor, 1 filială, 1 grupă și 3 elevi înscriși.
 * Rulează pe o bază goală — NU șterge date existente.
 * Parolele sunt hash-uite cu Argon2id, la fel ca la login.
 */
const { PrismaClient } = require('@prisma/client')
const argon2 = require('argon2')

const prisma = new PrismaClient()

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
}

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@pischool.md'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'PiSchool2026!'
const TEACHER_EMAIL = process.env.SEED_TEACHER_EMAIL || 'profesor@pischool.md'
const TEACHER_PASSWORD = process.env.SEED_TEACHER_PASSWORD || 'Profesor2026!'

async function main() {
  console.log('🌱 Seed PI School...')

  const existing = await prisma.user.count()
  if (existing > 0) {
    console.log(`⚠️  Există deja ${existing} utilizatori — nu suprascriu nimic.`)
    console.log('   Golește colecția "users" dacă vrei un seed curat.')
    return
  }

  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      name: 'Administrator',
      password: await argon2.hash(ADMIN_PASSWORD, ARGON2_OPTIONS),
      role: 'SUPERADMIN',
      active: true,
    },
  })
  console.log('👤 Superadmin:', admin.email)

  const teacher = await prisma.user.create({
    data: {
      email: TEACHER_EMAIL,
      name: 'Maria Ionescu',
      password: await argon2.hash(TEACHER_PASSWORD, ARGON2_OPTIONS),
      role: 'TEACHER',
      active: true,
    },
  })
  console.log('👩‍🏫 Profesor:', teacher.email)

  const branch = await prisma.branch.create({
    data: { name: 'Centru', address: 'str. Exemplu 1', active: true },
  })
  console.log('🏢 Filială:', branch.name)

  const group = await prisma.group.create({
    data: {
      name: 'Clasa 9 — Luni/Miercuri',
      level: 'Clasa 9',
      teacherId: teacher.id,
      branchId: branch.id,
      scheduleDays: ['Luni', 'Miercuri'],
      scheduleTime: JSON.stringify({ Luni: '18:00', Miercuri: '18:00' }),
      locationType: 'offline',
      locationDetails: 'Sala 2',
      startDate: new Date(),
      active: true,
    },
  })
  console.log('👥 Grupă:', group.name)

  const students = await Promise.all(
    [
      { fullName: 'Andrei Popescu', age: 15, grade: 9, parentPhone: '+37360000001' },
      { fullName: 'Maria Dumitrescu', age: 15, grade: 9, parentPhone: '+37360000002' },
      { fullName: 'Alexandru Marin', age: 14, grade: 9, parentPhone: '+37360000003' },
    ].map((data) =>
      prisma.student.create({ data: { ...data, active: true, createdById: admin.id } })
    )
  )
  console.log('🧑‍🎓 Elevi:', students.map((s) => s.fullName).join(', '))

  await prisma.groupStudent.createMany({
    data: students.map((s, i) => ({
      groupId: group.id,
      studentId: s.id,
      lessonsRemaining: [8, 6, 10][i],
      absences: [0, 1, 0][i],
      status: 'ACTIVE',
    })),
  })
  console.log('✅ Elevii au fost adăugați în grupă')

  console.log('\n✨ Seed complet!\n')
  console.log('📋 Date de autentificare:')
  console.log(`   Admin:    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
  console.log(`   Profesor: ${TEACHER_EMAIL} / ${TEACHER_PASSWORD}`)
  console.log('\n⚠️  Schimbă parolele imediat după primul login.\n')
}

main()
  .catch((e) => {
    console.error('❌ Eroare la seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
