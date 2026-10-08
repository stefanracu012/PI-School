import { PrismaClient } from '@prisma/client'
import { runMigrationsOnce } from './db-migrations'

const globalForPrisma = globalThis

// Configure Prisma Client with production optimizations
const prismaClientOptions = {
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
}

// Clientul de bază — folosit direct doar de migrări, ca să nu se aștepte pe ele însele
const baseClient = globalForPrisma.prismaBase ?? new PrismaClient(prismaClientOptions)

// Datele vechi PI School trebuie aduse la schema CRM înainte de prima citire
// (altfel câmpurile obligatorii lipsă dau „server error"). O singură dată per
// instanță; după prima rulare reușită costă o interogare. O eroare nu blochează
// aplicația — se reîncearcă la următoarea instanță.
let migrationPromise = globalForPrisma.prismaMigration ?? null
let migrated = false
function ensureMigrated() {
  if (!migrationPromise) {
    migrationPromise = runMigrationsOnce(baseClient)
      .catch((error) => {
        console.error('[migrare] Eșuată, aplicația continuă:', error?.message || error)
      })
      .finally(() => { migrated = true })
    globalForPrisma.prismaMigration = migrationPromise
  }
  return migrationPromise
}

const createClient = () =>
  baseClient.$extends({
    query: {
      $allModels: {
        $allOperations({ args, query }) {
          // După migrare, interogarea pleacă direct (merge și în $transaction([...]))
          if (migrated) return query(args)
          return ensureMigrated().then(() => query(args))
        },
      },
    },
  })

// Prisma singleton pattern - prevents multiple instances in development
export const prisma = globalForPrisma.prisma ?? createClient()

// Only cache the client in development to enable hot-reload
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaBase = baseClient
}

export default prisma
