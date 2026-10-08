import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * Conectarea contului la Telegram, fără căutat manual chat ID-uri.
 *
 * POST   → generează un token de unică folosință și întoarce linkul
 *          https://t.me/<bot>?start=<token>. La apăsarea lui Start, webhook-ul
 *          primește /start <token> și scrie chat ID-ul pe contul respectiv.
 * GET    → starea conexiunii pentru contul curent.
 * DELETE → deconectează contul (șterge chat ID-ul).
 */

const TOKEN_TTL_MINUTES = 30

// Username-ul botului PI School (fără @), din variabilele de mediu.
const BOT_USERNAME =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
  process.env.TELEGRAM_BOT_USERNAME ||
  ''

async function requireUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  return session.user
}

export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { telegramChatId: true, telegramUsername: true },
  })

  return NextResponse.json({
    connected: !!dbUser?.telegramChatId,
    username: dbUser?.telegramUsername || null,
    botConfigured: !!BOT_USERNAME,
  })
}

export async function POST() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })

  if (!BOT_USERNAME) {
    return NextResponse.json(
      { error: 'Lipsește NEXT_PUBLIC_TELEGRAM_BOT_USERNAME în variabilele de mediu' },
      { status: 500 }
    )
  }

  // Token scurt, dar imposibil de ghicit; valabil o singură dată
  const token = crypto.randomBytes(16).toString('hex')
  const expires = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000)

  await prisma.user.update({
    where: { id: user.id },
    data: { telegramLinkToken: token, telegramLinkExpires: expires },
  })

  return NextResponse.json({
    url: `https://t.me/${BOT_USERNAME}?start=${token}`,
    expiresAt: expires.toISOString(),
    expiresInMinutes: TOKEN_TTL_MINUTES,
  })
}

export async function DELETE() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })

  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramChatId: null,
      telegramUsername: null,
      telegramLinkToken: null,
      telegramLinkExpires: null,
    },
  })

  return NextResponse.json({ success: true, connected: false })
}
