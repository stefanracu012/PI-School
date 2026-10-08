/**
 * Verifică fișierul .env: ce e obligatoriu, ce e corect formatat,
 * ce funcții opționale sunt active.
 *
 *   node scripts/check-env.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = ['.env.local', '.env'].map((f) => path.join(root, f)).find((p) => fs.existsSync(p))

if (!envPath) {
  console.error('❌ Nu găsesc .env. Rulează: cp .env.example .env')
  process.exit(1)
}

const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  env[t.slice(0, i).trim()] = v
}

console.log(`📄 ${path.basename(envPath)}\n`)

let problems = 0
const fail = (msg) => {
  console.log(`  ❌ ${msg}`)
  problems++
}
const ok = (msg) => console.log(`  ✅ ${msg}`)
const warn = (msg) => console.log(`  ⚠️  ${msg}`)

// ── Obligatorii ───────────────────────────────────────────────────────────
console.log('OBLIGATORII')

if (!env.DATABASE_URL) fail('DATABASE_URL lipsește')
else if (!/mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/.test(env.DATABASE_URL))
  fail('DATABASE_URL nu conține numele bazei de date (ex: .../pischool?...)')
else ok('DATABASE_URL')

if (!env.NEXTAUTH_SECRET) fail('NEXTAUTH_SECRET lipsește')
else if (env.NEXTAUTH_SECRET.length < 32) fail('NEXTAUTH_SECRET e prea scurt (min. 32 caractere)')
else ok('NEXTAUTH_SECRET')

if (!env.ENCRYPTION_KEY) fail('ENCRYPTION_KEY lipsește')
else if (!/^[0-9a-f]{64}$/i.test(env.ENCRYPTION_KEY))
  fail('ENCRYPTION_KEY trebuie să aibă exact 64 caractere hex')
else ok('ENCRYPTION_KEY')

for (const k of ['NEXTAUTH_URL', 'NEXT_PUBLIC_APP_URL']) {
  if (!env[k]) fail(`${k} lipsește`)
  else if (env[k].startsWith('http://localhost')) warn(`${k} = ${env[k]} (schimbă-l la deploy)`)
  else ok(`${k} = ${env[k]}`)
}

// ── Funcții opționale ─────────────────────────────────────────────────────
console.log('\nFUNCȚII OPȚIONALE')

const feature = (name, active, hint) =>
  console.log(active ? `  ✅ ${name}` : `  ⚪ ${name} — inactiv${hint ? ` (${hint})` : ''}`)

feature('Cron protejat', !!env.CRON_SECRET, 'setează CRON_SECRET')
feature('CAPTCHA la login', !!env.TURNSTILE_SECRET_KEY, 'TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY')
feature('Upload imagini', !!env.BLOB_READ_WRITE_TOKEN, 'BLOB_READ_WRITE_TOKEN')
feature('Corectare AI', !!env.OPENAI_API_KEY, 'OPENAI_API_KEY')
feature('Rate limit pe Redis', !!env.UPSTASH_REDIS_REST_URL, 'fallback pe MongoDB — e ok')

const tgBot = env.TELEGRAM_LESSONS_BOT_TOKEN
const tgChat = env.TELEGRAM_ADMIN_CHAT_ID
feature('Notificări Telegram', !!(tgBot && tgChat), 'TELEGRAM_LESSONS_BOT_TOKEN + TELEGRAM_ADMIN_CHAT_ID')
feature('Botul de salarii', !!env.TELEGRAM_SALARY_BOT_TOKEN, 'TELEGRAM_SALARY_BOT_TOKEN')

if (tgBot && tgChat) {
  const threads = [
    'TELEGRAM_MISSED_LESSONS_THREAD_ID',
    'TELEGRAM_LOW_LESSONS_THREAD_ID',
    'TELEGRAM_PAYMENTS_THREAD_ID',
    'TELEGRAM_CONTACT_THREAD_ID',
    'TELEGRAM_ENROLLMENTS_THREAD_ID',
    'TELEGRAM_TEACHER_ACTIVITIES_THREAD_ID',
    'TELEGRAM_SECURITY_THREAD_ID',
  ]
  const set = threads.filter((t) => env[t]).length
  if (set === threads.length) console.log(`     └ topic-uri: toate ${set} configurate`)
  else if (set === 0)
    console.log('     └ topic-uri: niciunul — totul merge în „General"' +
      ' (rulează: node scripts/setup-telegram-topics.mjs)')
  else console.log(`     └ topic-uri: ${set}/${threads.length} configurate`)

  feature('Webhook Telegram (butoane status)', !!env.TELEGRAM_WEBHOOK_SECRET,
    'necesită și rularea scripts/set-telegram-webhook.mjs după deploy')
}

// ── Concluzie ─────────────────────────────────────────────────────────────
console.log('')
if (problems) {
  console.log(`❌ ${problems} problem${problems === 1 ? 'ă' : 'e'} de rezolvat înainte de pornire.`)
  process.exit(1)
}
console.log('✅ Configurare validă — aplicația poate porni.')
