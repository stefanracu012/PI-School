/**
 * Aduce datele vechi PI School la schema CRM-ului și importă cererile vechi
 * de pe site ca lead-uri. Aceeași migrare rulează automat la prima pornire a
 * aplicației; scriptul o forțează (ignoră marcajul) și e sigur de repetat.
 *
 *   npm run db:migrate-crm
 */
import { PrismaClient } from '@prisma/client'
import { runMigrations } from '../lib/db-migrations.js'

const prisma = new PrismaClient()

try {
  await runMigrations(prisma)
  console.log('✅ Migrare completă')
} catch (error) {
  console.error('❌ Migrare eșuată:', error)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
