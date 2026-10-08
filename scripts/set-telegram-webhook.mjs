/**
 * Script pentru înregistrarea webhook-ului Telegram
 * 
 * Folosire:
 *   node scripts/set-telegram-webhook.mjs https://yourdomain.com
 * 
 * Exemplu:
 *   node scripts/set-telegram-webhook.mjs https://pischool.md
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
console.log(`📄 Citesc variabilele din: ${envPath}`)
const envContent = readFileSync(envPath, 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  let value = trimmed.slice(eqIdx + 1).trim()
  // Strip ghilimele duble/single dacă există
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  env[key] = value
}

// --salary → botul de salarii, cu webhook-ul lui
const isSalary = process.argv.includes('--salary')
const tokenVar = isSalary ? 'TELEGRAM_SALARY_BOT_TOKEN' : 'TELEGRAM_LESSONS_BOT_TOKEN'
const token = env[tokenVar]
const secret = env.TELEGRAM_WEBHOOK_SECRET
const baseUrl = process.argv.slice(2).find(a => !a.startsWith('--'))?.replace(/\/$/, '')

if (!baseUrl) {
  console.error('❌ Folosire: node scripts/set-telegram-webhook.mjs https://yourdomain.com [--salary]')
  process.exit(1)
}

if (!token) {
  console.error(`❌ ${tokenVar} lipsește din .env`)
  process.exit(1)
}

const webhookUrl = `${baseUrl}/api/telegram/${isSalary ? 'salary' : 'webhook'}?secret=${secret}`
console.log(`📡 Setare webhook: ${webhookUrl}`)

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: webhookUrl,
    allowed_updates: ['callback_query', 'message'],
    drop_pending_updates: true,
  }),
})

const data = await response.json()

if (data.ok) {
  console.log('✅ Webhook înregistrat cu succes!')
  console.log(`   URL: ${webhookUrl}`)
} else {
  console.error('❌ Eroare la înregistrare:', data.description)
}

// Meniul de comenzi al botului de salarii
if (isSalary) {
  await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands: [{ command: 'meniu', description: 'Salarii — meniul principal' }] }),
  })
}

// Verificare webhook curent
const infoResp = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
const info = await infoResp.json()
if (info.ok) {
  console.log('\n📋 Info webhook curent:')
  console.log(`   URL: ${info.result.url || 'nesetat'}`)
  console.log(`   Pending updates: ${info.result.pending_update_count}`)
  if (info.result.last_error_message) {
    console.log(`   Ultima eroare: ${info.result.last_error_message}`)
  }
}
