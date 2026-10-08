import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { MongoClient, BSON } from 'mongodb'
import { authOptions } from '@/lib/auth'
import { createAuditLog, SEVERITY } from '@/lib/security/audit.js'
import { getRequestContext } from '@/lib/security/guards.js'

/**
 * Backup complet al bazei de date — doar SUPERADMIN.
 * Browserul cere datele pe bucăți și le scrie singur în folderul ales pe calculator
 * (components/admin/DatabaseBackup.js), deci aici nu se salvează nimic.
 *
 * GET                               → { database, collections: [{ name, count }] }
 * GET ?collection=Lead&after=<_id>  → { docs, next } — o pagină, în ordinea _id
 *
 * Documentele vin în MongoDB Extended JSON canonic, ca la import să-și păstreze
 * tipurile (ObjectId, date, Int vs Float). `next` e _id-ul de la care se continuă.
 */

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const { EJSON } = BSON

const PAGE_DOCS = 1000
// Răspunsurile Vercel au limită de 4.5 MB
const PAGE_BYTES = 2 * 1024 * 1024

const globalForMongo = globalThis

function getDb() {
  globalForMongo.backupMongoClient ??= new MongoClient(process.env.DATABASE_URL, {
    maxPoolSize: 2,
  })
  return globalForMongo.backupMongoClient.db()
}

async function listCollections(db) {
  const all = await db.listCollections({}, { nameOnly: true }).toArray()
  return all
    .filter((c) => c.type !== 'view' && !c.name.startsWith('system.'))
    .map((c) => c.name)
    .sort()
}

export async function GET(request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })
  if (session.user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Doar superadminul poate face backup' }, { status: 403 })
  }

  const params = new URL(request.url).searchParams
  const name = params.get('collection')

  try {
    const db = getDb()
    const names = await listCollections(db)

    if (!name) {
      const collections = await Promise.all(
        names.map(async (n) => ({ name: n, count: await db.collection(n).countDocuments() }))
      )
      await createAuditLog({
        action: 'database_backup',
        actorId: session.user.id,
        details: {
          collections: collections.length,
          documents: collections.reduce((sum, c) => sum + c.count, 0),
        },
        ...(await getRequestContext()),
        severity: SEVERITY.WARNING,
      })
      return NextResponse.json({ database: db.databaseName, collections })
    }

    if (!names.includes(name)) {
      return NextResponse.json({ error: `Colecția „${name}" nu există` }, { status: 404 })
    }

    const after = params.get('after')
    const filter = after ? { _id: { $gt: EJSON.parse(after, { relaxed: false }) } } : {}
    const cursor = db.collection(name).find(filter).sort({ _id: 1 }).limit(PAGE_DOCS)

    const docs = []
    let bytes = 0
    let next = null
    for await (const doc of cursor) {
      const serialized = EJSON.serialize(doc, { relaxed: false })
      docs.push(serialized)
      bytes += Buffer.byteLength(JSON.stringify(serialized))
      if (bytes >= PAGE_BYTES || docs.length === PAGE_DOCS) {
        next = EJSON.stringify(doc._id, { relaxed: false })
        break
      }
    }
    await cursor.close()

    return NextResponse.json({ docs, next })
  } catch (err) {
    console.error('Backup error:', err)
    return NextResponse.json({ error: 'Nu am putut citi baza de date' }, { status: 500 })
  }
}
