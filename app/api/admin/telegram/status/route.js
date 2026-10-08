import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'

/**
 * Diagnostic Telegram: cine are contul conectat și de ce nu ajunge un mesaj.
 *
 * GET                     → botul + lista de profesori/admini cu starea conexiunii
 * GET ?test=<userId>      → trimite un mesaj de test și întoarce răspunsul brut
 *                           al Telegram (aici se vede exact motivul eșecului)
 */

export const runtime = 'nodejs'

const BOT_TOKEN = process.env.TELEGRAM_LESSONS_BOT_TOKEN

async function callTelegram(method, payload) {
  if (!BOT_TOKEN) return { ok: false, description: 'TELEGRAM_LESSONS_BOT_TOKEN lipsește' }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return await res.json()
  } catch (err) {
    return { ok: false, description: err.message }
  }
}

export async function GET(request) {
  try {
    await requireAdmin()

    const testUserId = new URL(request.url).searchParams.get('test')

    const users = await prisma.user.findMany({
      where: { role: { in: ['TEACHER', 'ADMIN', 'SUPERADMIN'] }, active: true },
      select: {
        id: true, name: true, email: true, role: true,
        telegramChatId: true, telegramUsername: true,
      },
      orderBy: { name: 'asc' },
    })

    // ── Test: trimitem un mesaj real și arătăm ce răspunde Telegram ──
    if (testUserId) {
      const user = users.find((u) => u.id === testUserId)
      if (!user) {
        return NextResponse.json({ error: 'Utilizatorul nu a fost găsit' }, { status: 404 })
      }
      if (!user.telegramChatId) {
        return NextResponse.json({
          ok: false,
          user: user.name,
          reason: 'Contul nu are telegramChatId — trebuie conectat din Securitate → Telegram sau completat manual în fișa profesorului',
        })
      }

      const result = await callTelegram('sendMessage', {
        chat_id: user.telegramChatId,
        text: `✅ Test PI School CRM — mesajele private ajung la ${user.name}.`,
        parse_mode: 'HTML',
      })

      return NextResponse.json({
        ok: !!result.ok,
        user: user.name,
        chatId: user.telegramChatId,
        telegram: result.ok
          ? { ok: true }
          : { ok: false, error_code: result.error_code, description: result.description },
        hint: result.ok
          ? null
          : result.error_code === 403
            ? 'Profesorul nu a pornit conversația cu botul. Trebuie să deschidă botul în Telegram și să apese /start.'
            : 'Vezi descrierea de la Telegram.',
      })
    }

    const me = await callTelegram('getMe', {})
    const webhook = await callTelegram('getWebhookInfo', {})

    return NextResponse.json({
      bot: me.ok
        ? { username: me.result?.username, id: me.result?.id }
        : { error: me.description },
      webhook: webhook.ok
        ? {
            url: webhook.result?.url || '(nesetat)',
            pendingUpdates: webhook.result?.pending_update_count,
            lastError: webhook.result?.last_error_message || null,
          }
        : { error: webhook.description },
      supervisors: (process.env.TELEGRAM_SUPERVISOR_CHAT_IDS || '')
        .split(',').map((s) => s.trim()).filter(Boolean),
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        conectat: !!u.telegramChatId,
        chatId: u.telegramChatId || null,
        username: u.telegramUsername || null,
      })),
      cumTestez: 'adaugă ?test=<id-ul de mai sus> ca să trimiți un mesaj real',
    })
  } catch (error) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('Eroare la diagnosticul Telegram:', error)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}
