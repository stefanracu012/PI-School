import crypto from 'crypto'
import { cookies } from 'next/headers'

/**
 * Sistem de impersonare pentru SUPERADMIN.
 * 
 * Stochează într-un cookie HTTP-only semnat (HMAC-SHA256) target user-ul
 * pentru care SUPERADMIN-ul vrea să simuleze sesiunea.
 * Cookie-ul NextAuth original rămâne neatins — doar JWT callback-ul
 * citește acest cookie și suprascrie identitatea în token-ul de sesiune.
 */

export const IMPERSONATION_COOKIE = 'pischool-impersonate'
const MAX_AGE_SECONDS = 8 * 60 * 60 // 8 ore

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is not set')
  return secret
}

function sign(payload) {
  const json = JSON.stringify(payload)
  const data = Buffer.from(json).toString('base64url')
  const sig = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url')
  return `${data}.${sig}`
}

function verify(token) {
  if (!token || typeof token !== 'string') return null
  const [data, sig] = token.split('.')
  if (!data || !sig) return null
  const expected = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url')
  // Timing-safe compare
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

/**
 * Citește payload-ul de impersonare din cookie (server-side).
 * @returns {{ originalUserId: string, targetUserId: string, exp: number } | null}
 */
export async function readImpersonation() {
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get(IMPERSONATION_COOKIE)?.value
    if (!raw) return null
    return verify(raw)
  } catch {
    return null
  }
}

/**
 * Setează cookie-ul de impersonare.
 */
export async function setImpersonation(originalUserId, targetUserId) {
  const cookieStore = await cookies()
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS
  const token = sign({ originalUserId, targetUserId, exp })
  cookieStore.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

/**
 * Șterge cookie-ul de impersonare.
 */
export async function clearImpersonation() {
  const cookieStore = await cookies()
  cookieStore.delete(IMPERSONATION_COOKIE)
}
