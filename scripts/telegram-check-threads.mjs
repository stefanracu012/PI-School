/**
 * Script de verificare a rutării mesajelor pe topic-uri (Telegram)
 *
 * Trimite câte un mesaj de test în fiecare topic configurat, ca să vezi în
 * Telegram dacă denumirea topicului corespunde cu tipul de mesaje care ajunge acolo.
 *
 * Folosire:
 *   node scripts/telegram-check-threads.mjs           # doar afișează configurația
 *   node scripts/telegram-check-threads.mjs --send    # trimite mesajele de test
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Citire env: .env.local are prioritate, apoi .env
const candidates = ['.env.local', '.env']
const envPath = candidates.map(f => resolve(process.cwd(), f)).find(p => existsSync(p))
if (!envPath) {
  console.error('❌ Nu am găsit .env.local sau .env în', process.cwd())
  process.exit(1)
}
console.log(`📄 Citesc variabilele din: ${envPath}\n`)
const envContent = readFileSync(envPath, 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  let value = trimmed.slice(eqIdx + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  env[key] = value
}

const token = env.TELEGRAM_LESSONS_BOT_TOKEN
const chatId = env.TELEGRAM_ADMIN_CHAT_ID || env.TELEGRAM_LESSONS_CHAT_ID

if (!token) {
  console.error('❌ TELEGRAM_LESSONS_BOT_TOKEN lipsește')
  process.exit(1)
}
if (!chatId) {
  console.error('❌ TELEGRAM_ADMIN_CHAT_ID lipsește')
  process.exit(1)
}

// Ce fel de mesaje trimite aplicația în fiecare topic
const ROUTES = [
  {
    envVar: 'TELEGRAM_MISSED_LESSONS_THREAD_ID',
    label: 'Lecții neefectuate',
    sends: 'LECȚIE NEEFECTUATĂ, RECUPERARE NEEFECTUATĂ, LECȚIE NEPORNITĂ, LECȚIE/RECUPERARE ANULATĂ',
  },
  {
    envVar: 'TELEGRAM_LOW_LESSONS_THREAD_ID',
    label: 'Ore rămase',
    sends: 'DOAR N LECȚII, ZERO LECȚII, LECȚII NEGATIVE',
  },
  {
    envVar: 'TELEGRAM_ENROLLMENTS_THREAD_ID',
    label: 'Înscrieri',
    sends: 'ÎNSCRIERE NOUĂ (formular site)',
  },
  {
    envVar: 'TELEGRAM_CONTACT_THREAD_ID',
    label: 'Contact / lecție gratuită',
    sends: 'CERERE LECȚIE GRATUITĂ (cu butoane de status)',
    fallback: 'TELEGRAM_ENROLLMENTS_THREAD_ID',
  },
  {
    envVar: 'TELEGRAM_TEACHER_ACTIVITIES_THREAD_ID',
    label: 'Activități profesori',
    sends: 'GRUPĂ NOUĂ, ELEV NOU, ELEV ADĂUGAT ÎN GRUPĂ, PLATĂ NOUĂ, MODIFICARE GRUPĂ',
  },
  {
    envVar: 'TELEGRAM_PAYMENTS_THREAD_ID',
    label: 'Plăți / abonamente',
    sends: 'Raport zilnic abonamente /learn (expirate + expiră în curând)',
    fallback: 'TELEGRAM_LOW_LESSONS_THREAD_ID',
  },
]

console.log(`💬 Chat: ${chatId}\n`)
console.log('📋 Configurație curentă:\n')

const resolved = []
for (const route of ROUTES) {
  let threadId = env[route.envVar]
  let via = route.envVar
  if (!threadId && route.fallback) {
    threadId = env[route.fallback]
    via = `${route.fallback} (fallback)`
  }
  resolved.push({ ...route, threadId, via })

  if (!threadId) {
    console.log(`   ⚠️  ${route.label.padEnd(26)} — NESETAT → mesajele ajung în „General"`)
  } else {
    console.log(`   ✅ ${route.label.padEnd(26)} — thread ${threadId} (${via})`)
  }
}

// Avertizare pentru ID-uri duplicate (două tipuri de mesaje în același topic)
const byThread = {}
for (const r of resolved) {
  if (!r.threadId) continue
  ;(byThread[r.threadId] ||= []).push(r.label)
}
const duplicates = Object.entries(byThread).filter(([, labels]) => labels.length > 1)
if (duplicates.length) {
  console.log('\n⚠️  Topic-uri folosite de mai multe tipuri de mesaje:')
  for (const [threadId, labels] of duplicates) {
    console.log(`   thread ${threadId}: ${labels.join(' + ')}`)
  }
}

if (!process.argv.includes('--send')) {
  console.log('\n💡 Rulează cu --send ca să trimit un mesaj de test în fiecare topic.')
  process.exit(0)
}

console.log('\n📤 Trimit mesajele de test...\n')

for (const route of resolved) {
  const text = `🔎 <b>TEST RUTARE</b>

📌 Topic așteptat: <b>${route.label}</b>
🔧 Variabilă: <code>${route.via}</code>${route.threadId ? ` = <code>${route.threadId}</code>` : ''}

📨 Aici ajung mesajele:
<i>${route.sends}</i>

❓ Dacă denumirea acestui topic nu se potrivește, ori schimbă denumirea topicului, ori pune alt ID în variabila de mai sus.`

  const body = { chat_id: chatId, text, parse_mode: 'HTML' }
  if (route.threadId) body.message_thread_id = parseInt(route.threadId)

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (data.ok) {
      console.log(`   ✅ ${route.label} → thread ${route.threadId || 'General'}`)
    } else {
      console.log(`   ❌ ${route.label} → ${data.description}`)
    }
  } catch (e) {
    console.log(`   ❌ ${route.label} → ${e.message}`)
  }
}

console.log('\n✔ Gata. Verifică în Telegram în ce topic a aterizat fiecare mesaj de test.')
