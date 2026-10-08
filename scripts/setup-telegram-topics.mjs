/**
 * Creează topic-urile de notificări în grupul Telegram și scrie ID-urile în .env.
 *
 *   node scripts/setup-telegram-topics.mjs
 *
 * Cerințe:
 *   - TELEGRAM_LESSONS_BOT_TOKEN și TELEGRAM_ADMIN_CHAT_ID setate în .env
 *   - grupul să fie de tip „forum" (Topics activate)
 *   - botul să fie ADMINISTRATOR cu dreptul „Manage topics"
 *
 * Rulează-l de câte ori vrei: topic-urile care au deja ID în .env sunt sărite.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, '.env')

// ── Citire .env ───────────────────────────────────────────────────────────
if (!fs.existsSync(envPath)) {
  console.error('❌ Nu găsesc .env în rădăcina proiectului.')
  process.exit(1)
}
let envRaw = fs.readFileSync(envPath, 'utf8')

const readVar = (key) => {
  const m = envRaw.match(new RegExp(`^${key}=["']?(.*?)["']?\\s*$`, 'm'))
  return m ? m[1] : ''
}

const TOKEN = readVar('TELEGRAM_LESSONS_BOT_TOKEN')
const CHAT_ID = readVar('TELEGRAM_ADMIN_CHAT_ID')

if (!TOKEN || !CHAT_ID) {
  console.error('❌ Lipsește TELEGRAM_LESSONS_BOT_TOKEN sau TELEGRAM_ADMIN_CHAT_ID din .env')
  process.exit(1)
}

// ── Topic-urile de care are nevoie aplicația ──────────────────────────────
// icon_color: una dintre valorile acceptate de Telegram
const TOPICS = [
  { env: 'TELEGRAM_MISSED_LESSONS_THREAD_ID', name: '📅 Lecții ratate', color: 0xff93b2 },
  { env: 'TELEGRAM_LOW_LESSONS_THREAD_ID', name: '⏳ Ore rămase', color: 0xffd67e },
  { env: 'TELEGRAM_PAYMENTS_THREAD_ID', name: '💰 Plăți', color: 0x6fb9f0 },
  { env: 'TELEGRAM_CONTACT_THREAD_ID', name: '📨 Contact / Lead-uri', color: 0x8eee98 },
  { env: 'TELEGRAM_ENROLLMENTS_THREAD_ID', name: '📝 Înscrieri', color: 0xcb86db },
  { env: 'TELEGRAM_TEACHER_ACTIVITIES_THREAD_ID', name: '👩‍🏫 Activitate profesori', color: 0x6fb9f0 },
  { env: 'TELEGRAM_SECURITY_THREAD_ID', name: '🔐 Securitate', color: 0xff93b2 },
]

const api = async (method, body) => {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

// ── Verificări preliminare ────────────────────────────────────────────────
const chat = await api('getChat', { chat_id: CHAT_ID })
if (!chat.ok) {
  console.error('❌ Nu pot accesa grupul:', chat.description)
  process.exit(1)
}
if (!chat.result.is_forum) {
  console.error('❌ Grupul nu are Topics activate. Group Settings → Topics → On.')
  process.exit(1)
}
console.log(`📢 Grup: ${chat.result.title} (${CHAT_ID})\n`)

// ── Creare topic-uri ──────────────────────────────────────────────────────
const setEnv = (key, value) => {
  const line = `${key}="${value}"`
  const re = new RegExp(`^#?\\s*${key}=.*$`, 'm')
  envRaw = re.test(envRaw) ? envRaw.replace(re, line) : envRaw.trimEnd() + `\n${line}\n`
}

let created = 0
let blocked = false
for (const topic of TOPICS) {
  if (readVar(topic.env)) {
    console.log(`⏭️  ${topic.name} — există deja (${readVar(topic.env)})`)
    continue
  }

  const res = await api('createForumTopic', {
    chat_id: CHAT_ID,
    name: topic.name,
    icon_color: topic.color,
  })

  if (!res.ok) {
    console.error(`❌ ${topic.name}: ${res.description}`)
    if (String(res.description).includes('not enough rights')) {
      console.error(
        '\n   Botul trebuie să fie ADMINISTRATOR în grup, cu dreptul „Manage topics".\n' +
          '   Telegram → grup → Administrators → Add Admin → botul tău → activează „Manage Topics".\n'
      )
      blocked = true
      break
    }
    continue
  }

  setEnv(topic.env, res.result.message_thread_id)
  fs.writeFileSync(envPath, envRaw)
  created++
  console.log(`✅ ${topic.name} → thread ${res.result.message_thread_id}`)
}

if (blocked) {
  process.exitCode = 1
} else {
  console.log(`\n🎉 Gata. ${created} topic-uri noi. ID-urile au fost scrise în .env.`)
  console.log('   Copiază aceleași valori și în variabilele de mediu din Vercel.')
}
