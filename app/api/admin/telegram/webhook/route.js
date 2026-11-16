import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAuditLog, SEVERITY } from '@/lib/security/audit.js'
import { getRequestContext } from '@/lib/security/guards.js'

/**
 * Webhook-ul botului Telegram, administrat din Securitate — doar SUPERADMIN.
 * Înlocuiește rularea manuală a scripts/set-telegram-webhook.mjs.
 *
 * GET  → starea webhook-ului la Telegram (URL, coadă, ultima eroare) + ce URL s-ar seta
 * POST → înregistrează webhook-ul pe domeniul de pe care e apăsat butonul
 *
 * Fără webhook, Telegram nu mai trimite nimic către CRM: butoanele din mesaje
 * (prezență, statusuri lead) nu fac nimic, iar linkul de conectare nu leagă contul.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BOT_TOKEN = process.env.TELEGRAM_LESSONS_BOT_TOKEN
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET
const WEBHOOK_PATH = '/api/telegram/webhook'

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Neautentificat' }, { status: 401 }) }
  }
  if (session.user.role !== 'SUPERADMIN') {
    return { error: NextResponse.json({ error: 'Doar superadminul poate seta webhook-ul' }, { status: 403 }) }
  }
  return { user: session.user }
}

async function callTelegram(method, payload) {
  if (!BOT_TOKEN) return { ok: false, description: 'TELEGRAM_LESSONS_BOT_TOKEN lipsește din variabilele de mediu' }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    })
    return await res.json()
  } catch (err) {
    return { ok: false, description: err.message }
  }
}

// Domeniul de pe care s-a apăsat butonul (în spatele proxy-ului Vercel contează x-forwarded-*)
function getBaseUrl(request) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  if (host) {
    const proto = request.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
    return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`
  }
  return (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
}

function buildWebhookUrl(baseUrl) {
  const url = `${baseUrl}${WEBHOOK_PATH}`
  return WEBHOOK_SECRET ? `${url}?secret=${encodeURIComponent(WEBHOOK_SECRET)}` : url
}

// URL-ul e arătat în interfață — secretul nu trebuie să ajungă în browser
const maskSecret = (url) => (url ? url.replace(/secret=[^&]+/, 'secret=•••') : url)

function describeWebhook(info, expectedUrl) {
  const registered = info?.url || ''
  return {
    url: maskSecret(registered) || null,
    active: !!registered,
    // Se potrivește exact cu ce am seta de pe acest domeniu (secret inclus)?
    matchesThisSite: !!registered && registered === expectedUrl,
    pendingUpdates: info?.pending_update_count ?? 0,
    lastError: info?.last_error_message || null,
    lastErrorDate: info?.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
  }
}

export async function GET(request) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const baseUrl = getBaseUrl(request)
  const expectedUrl = buildWebhookUrl(baseUrl)

  const [me, info] = await Promise.all([callTelegram('getMe'), callTelegram('getWebhookInfo')])

  return NextResponse.json({
    botConfigured: !!BOT_TOKEN,
    secretConfigured: !!WEBHOOK_SECRET,
    bot: me.ok ? { username: me.result?.username } : null,
    target: maskSecret(expectedUrl),
    targetIsHttps: baseUrl.startsWith('https://'),
    webhook: info.ok ? describeWebhook(info.result, expectedUrl) : null,
    telegramError: !me.ok ? me.description : !info.ok ? info.description : null,
  })
}

export async function POST(request) {
  const { user, error } = await requireSuperAdmin()
  if (error) return error

  if (!BOT_TOKEN) {
    return NextResponse.json(
      { error: 'TELEGRAM_LESSONS_BOT_TOKEN lipsește din variabilele de mediu' },
      { status: 500 }
    )
  }

  const baseUrl = getBaseUrl(request)
  if (!baseUrl.startsWith('https://')) {
    return NextResponse.json(
      {
        error:
          'Telegram acceptă webhook doar pe https. Apasă butonul din site-ul publicat (nu de pe localhost).',
      },
      { status: 400 }
    )
  }

  const webhookUrl = buildWebhookUrl(baseUrl)
  const result = await callTelegram('setWebhook', {
    url: webhookUrl,
    allowed_updates: ['callback_query', 'message'],
    // Butoanele apăsate cât webhook-ul era căzut nu mai are rost să le procesăm acum
    drop_pending_updates: true,
  })

  await createAuditLog({
    action: 'telegram_webhook_set',
    actorId: user.id,
    details: { url: maskSecret(webhookUrl), ok: !!result.ok, error: result.ok ? null : result.description },
    ...(await getRequestContext()),
    severity: SEVERITY.WARNING,
    success: !!result.ok,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: `Telegram a refuzat webhook-ul: ${result.description || 'eroare necunoscută'}` },
      { status: 502 }
    )
  }

  const info = await callTelegram('getWebhookInfo')
  return NextResponse.json({
    success: true,
    webhook: info.ok ? describeWebhook(info.result, webhookUrl) : null,
  })
}
