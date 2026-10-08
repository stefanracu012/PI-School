import prisma from '@/lib/prisma'

/**
 * Cache comun pentru răspunsuri lente de la servicii externe.
 *
 * Memoria procesului nu ajunge: pe Vercel rulează mai multe instanțe, fiecare
 * cu memoria ei, iar utilizatorul nimerește când una, când alta. Baza de date
 * e văzută de toate și răspunde în milisecunde, față de secundele lui Meta.
 *
 * Peste ea stă și un strat în memorie, ca cererile dese să nu mai atingă nici
 * măcar baza.
 */

const memory = new Map() // key → { payload, at }
const MEMORY_MS = 5000

export async function readCache(key) {
  const local = memory.get(key)
  if (local && Date.now() - local.at < MEMORY_MS) {
    return { payload: local.payload, ageMs: Date.now() - local.at, from: 'memorie' }
  }

  try {
    const row = await prisma.externalCache.findUnique({ where: { key } })
    if (!row) return null

    const ageMs = Date.now() - new Date(row.updatedAt).getTime()
    memory.set(key, { payload: row.payload, at: Date.now() - Math.min(ageMs, MEMORY_MS) })
    return { payload: row.payload, ageMs, from: 'bază' }
  } catch {
    // Fără cache mergem mai departe, doar mai încet
    return null
  }
}

export async function writeCache(key, payload) {
  memory.set(key, { payload, at: Date.now() })
  try {
    await prisma.externalCache.upsert({
      where: { key },
      create: { key, payload },
      update: { payload },
    })
  } catch (e) {
    console.error('[cache] nu s-a putut scrie', key, e?.message)
  }
}
