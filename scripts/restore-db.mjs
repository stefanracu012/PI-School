/**
 * Pune înapoi în MongoDB un backup făcut din admin (Securitate → Backup baza de date).
 *
 *   npm run db:restore -- "C:\Users\...\PI-School-CRM-Backup\2026-10-02"
 *   npm run db:restore -- "<folder>" --only Lead,LeadNote   # doar anumite colecții
 *   npm run db:restore -- "<folder>" --replace              # golește întâi colecțiile cu date
 *
 * Scrie în baza din DATABASE_URL (.env / .env.local). Pentru altă bază (de ex. una goală,
 * ca să verifici backup-ul), setează variabila înainte:
 *   $env:DATABASE_URL="mongodb+srv://.../alta-baza"; npm run db:restore -- "<folder>"
 *
 * Fără --replace, colecțiile care au deja date se sar, ca să nu se dubleze nimic.
 * Înainte să scrie ceva, arată planul și cere numele bazei drept confirmare.
 */
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { MongoClient, BSON } from 'mongodb'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
for (const file of ['.env.local', '.env']) {
  const envPath = path.join(root, file)
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath)
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { only: { type: 'string' }, replace: { type: 'boolean', default: false } },
})

const dir = positionals[0]
if (!dir) {
  console.error('Folosire: npm run db:restore -- "<folderul zilei din PI-School-CRM-Backup>" [--only A,B] [--replace]')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('❌ Lipsește DATABASE_URL (pune-l în .env sau setează-l în terminal).')
  process.exit(1)
}

const infoPath = path.join(dir, '_info.json')
if (!fs.existsSync(infoPath)) {
  console.error(`❌ Nu găsesc ${infoPath} — folderul nu e un backup terminat.`)
  process.exit(1)
}
const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'))

let names = Object.keys(info.collections)
if (values.only) {
  const wanted = values.only.split(',').map((s) => s.trim()).filter(Boolean)
  const unknown = wanted.filter((n) => !names.includes(n))
  if (unknown.length) {
    console.error(`❌ Nu sunt în backup: ${unknown.join(', ')}`)
    process.exit(1)
  }
  names = wanted
}

const client = new MongoClient(process.env.DATABASE_URL)

try {
  await client.connect()
  const db = client.db()
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name))

  console.log(`\nBackup:  ${dir}  (${new Date(info.createdAt).toLocaleString('ro-RO')}, baza „${info.database}")`)
  console.log(`Țintă:   baza „${db.databaseName}" pe ${new URL(process.env.DATABASE_URL).host}\n`)

  const plan = []
  for (const name of names) {
    const current = existing.has(name) ? await db.collection(name).countDocuments() : 0
    const action = current === 0 ? 'se adaugă' : values.replace ? `se înlocuiește (are acum ${current})` : `SARE — are deja ${current}`
    plan.push({ name, current, skip: current > 0 && !values.replace })
    console.log(`  ${name.padEnd(24)} ${String(info.collections[name]).padStart(7)} înregistrări → ${action}`)
  }

  if (plan.every((p) => p.skip)) {
    console.log('\nNimic de făcut. Folosește --replace dacă vrei să suprascrii datele existente.')
    process.exit(0)
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`\nScrie numele bazei („${db.databaseName}") ca să confirmi: `)
  rl.close()
  if (answer.trim() !== db.databaseName) {
    console.log('Anulat — nu s-a scris nimic.')
    process.exit(0)
  }

  const created = []
  for (const { name, current, skip } of plan) {
    if (skip) continue
    const docs = BSON.EJSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'), { relaxed: false })
    const collection = db.collection(name)
    // deleteMany, nu drop — indexurile (unic pe email etc.) rămân
    if (current > 0) await collection.deleteMany({})
    for (let i = 0; i < docs.length; i += 1000) {
      await collection.insertMany(docs.slice(i, i + 1000))
    }
    if (!existing.has(name)) created.push(name)
    console.log(`  ✅ ${name}: ${docs.length}`)
  }

  console.log('\nGata.')
  if (created.length) {
    console.log(`Colecții create de la zero (fără indexuri): ${created.join(', ')}`)
    console.log('Rulează „npm run db:push" ca să refaci indexurile din schema Prisma.')
  }
} finally {
  await client.close()
}
