/**
 * Alternativă la `setup-telegram-topics.mjs`, pentru cazul în care nu vrei
 * să dai botului drept de administrator.
 *
 * Tu creezi topic-urile manual în Telegram, apoi scrii orice mesaj în fiecare
 * (ex: „test"). Scriptul citește update-urile botului, află thread ID-ul
 * fiecărui topic și le scrie în .env.
 *
 *   node scripts/discover-telegram-topics.mjs
 *
 * Notă: funcționează doar dacă webhook-ul NU e încă setat (getUpdates și
 * webhook-ul se exclud reciproc). Rulează-l înainte de `telegram:webhook`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, '.env')

if (!fs.existsSync(envPath)) {
  console.error('❌ Nu găsesc .env')
  process.exit(1)
}
let envRaw = fs.readFileSync(envPath, 'utf8')
const readVar = (k) => {
  const m = envRaw.match(new RegExp(`^${k}=["']?(.*?)["']?\\s*$`, 'm'))
  return m ? m[1] : ''
}

const TOKEN = readVar('TELEGRAM_LESSONS_BOT_TOKEN')
if (!TOKEN) {
  console.error('❌ Lipsește TELEGRAM_LESSONS_BOT_TOKEN din .env')
  process.exit(1)
}

// Cuvinte-cheie după care se recunoaște fiecare topic (case-insensitive,
// diacriticele sunt ignorate). Ordinea contează: prima potrivire câștigă.
const MATCHERS = [
  { env: 'TELEGRAM_MISSED_LESSONS_THREAD_ID', keys: ['ratat', 'missed', 'anulat'] },
  { env: 'TELEGRAM_LOW_LESSONS_THREAD_ID', keys: ['ore ramase', 'ramase', 'putine', 'low'] },
  { env: 'TELEGRAM_PAYMENTS_THREAD_ID', keys: ['plati', 'plata', 'payment'] },
  { env: 'TELEGRAM_ENROLLMENTS_THREAD_ID', keys: ['inscrier', 'enroll'] },
  { env: 'TELEGRAM_CONTACT_THREAD_ID', keys: ['contact', 'lead'] },
  { env: 'TELEGRAM_TEACHER_ACTIVITIES_THREAD_ID', keys: ['profesor', 'teacher'] },
  { env: 'TELEGRAM_SECURITY_THREAD_ID', keys: ['secur'] },
]

// „Plăți" -> „plati", ca potrivirea să meargă indiferent de diacritice
const normalize = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[țţ]/g, 't').replace(/[șş]/g, 's')

const res = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?limit=100`).then((r) => r.json())
if (!res.ok) {
  console.error('❌ getUpdates a eșuat:', res.description)
  if (String(res.description).includes('webhook')) {
    console.error('   Webhook-ul e activ. Șterge-l temporar:')
    console.error(`   curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"`)
  }
  process.exit(1)
}

// ── Colectare topic-uri din update-uri ────────────────────────────────────
const found = new Map() // threadId -> name
for (const u of res.result) {
  const msg = u.message || u.edited_message || u.channel_post
  if (!msg?.message_thread_id) continue
  const name =
    msg.forum_topic_created?.name ||
    msg.reply_to_message?.forum_topic_created?.name ||
    found.get(msg.message_thread_id) ||
    null
  if (name) found.set(msg.message_thread_id, name)
  else if (!found.has(msg.message_thread_id)) found.set(msg.message_thread_id, null)
}

if (found.size === 0) {
  console.log('⚠️  Niciun topic găsit în ultimele update-uri.\n')
  console.log('   1. Creează topic-urile în grup (Telegram → grup → Topics → +)')
  console.log('   2. Scrie orice mesaj în fiecare topic')
  console.log('   3. Rulează din nou acest script\n')
  console.log('   Telegram păstrează update-urile ~24h, deci fă pașii aproape unul după altul.')
  process.exit(0)
}

console.log(`🔎 Topic-uri găsite: ${found.size}\n`)
for (const [id, name] of found) console.log(`   ${String(id).padEnd(6)} ${name || '(nume necunoscut)'}`)

// ── Potrivire cu variabilele din .env ─────────────────────────────────────
const setEnv = (key, value) => {
  const line = `${key}="${value}"`
  const re = new RegExp(`^#?\\s*${key}=.*$`, 'm')
  envRaw = re.test(envRaw) ? envRaw.replace(re, line) : envRaw.trimEnd() + `\n${line}\n`
}

console.log('')
let matched = 0
const unmatched = []
for (const [id, name] of found) {
  if (!name) {
    unmatched.push({ id, name })
    continue
  }
  const lower = normalize(name)
  const hit = MATCHERS.find((m) => m.keys.some((k) => lower.includes(normalize(k))))
  if (hit) {
    setEnv(hit.env, id)
    matched++
    console.log(`✅ ${hit.env} = ${id}   ← „${name}"`)
  } else {
    unmatched.push({ id, name })
  }
}

fs.writeFileSync(envPath, envRaw)

if (unmatched.length) {
  console.log('\n⚠️  Nepotrivite automat (completează manual în .env dacă îți trebuie):')
  for (const u of unmatched) console.log(`   thread ${u.id} — ${u.name || 'nume necunoscut'}`)
}

console.log(`\n🎉 ${matched} variabile scrise în .env.`)
console.log('   Verifică cu: npm run env:check')
