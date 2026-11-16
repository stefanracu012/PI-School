import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { hashPassword, verifyPassword } from '@/lib/security/argon2.js'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { createAuditLog, SEVERITY } from '@/lib/security/audit.js'

/**
 * POST /api/account/password
 * Fiecare utilizator (admin sau profesor) își schimbă singur parola, cu orice parolă dorește.
 *
 * Body: { currentPassword, newPassword }
 *
 * Cere parola curentă: o sesiune lăsată deschisă pe un calculator străin nu trebuie să
 * ajungă pentru a prelua contul. Dacă ai uitat-o de tot, există „Am uitat parola" la login.
 */

export const runtime = 'nodejs'

const MIN_LENGTH = 6
const MAX_LENGTH = 128

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })
    }

    // În modul „intră ca profesor", session.user e profesorul — nu îi schimbăm parola din greșeală
    if (session.user.impersonating) {
      return NextResponse.json(
        { error: 'Nu poți schimba parola cât timp ești conectat ca alt utilizator' },
        { status: 403 }
      )
    }

    const ip = getClientIP(request)
    const rate = checkRateLimit(`change-password:${session.user.id}`, 5, 15 * 60 * 1000)
    if (!rate.success) {
      const minutes = Math.ceil(rate.resetIn / 60000)
      return NextResponse.json(
        { error: `Prea multe încercări. Așteaptă ${minutes} minute.` },
        { status: 429 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { currentPassword, newPassword } = body

    if (!currentPassword || typeof currentPassword !== 'string') {
      return NextResponse.json({ error: 'Introdu parola curentă' }, { status: 400 })
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json({ error: 'Introdu parola nouă' }, { status: 400 })
    }
    if (newPassword.length < MIN_LENGTH) {
      return NextResponse.json(
        { error: `Parola nouă trebuie să aibă cel puțin ${MIN_LENGTH} caractere` },
        { status: 400 }
      )
    }
    if (newPassword.length > MAX_LENGTH) {
      return NextResponse.json(
        { error: `Parola nu poate depăși ${MAX_LENGTH} de caractere` },
        { status: 400 }
      )
    }
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: 'Parola nouă trebuie să fie diferită de cea curentă' },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, password: true, active: true },
    })
    if (!user || !user.active) {
      return NextResponse.json({ error: 'Cont indisponibil' }, { status: 404 })
    }

    const valid = await verifyPassword(user.password, currentPassword)
    if (!valid) {
      await createAuditLog({
        action: 'password_change_failed',
        actorId: user.id,
        targetId: user.id,
        targetType: 'user',
        ipAddress: ip,
        userAgent: request.headers.get('user-agent'),
        details: { reason: 'wrong_current_password' },
        severity: SEVERITY.WARNING,
        success: false,
      })
      return NextResponse.json({ error: 'Parola curentă este greșită' }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await hashPassword(newPassword),
        // Un link de resetare cerut mai devreme nu mai trebuie să poată suprascrie parola aleasă acum
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    })

    await createAuditLog({
      action: 'password_changed',
      actorId: user.id,
      targetId: user.id,
      targetType: 'user',
      ipAddress: ip,
      userAgent: request.headers.get('user-agent'),
      details: { email: user.email },
      severity: SEVERITY.WARNING,
      success: true,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json({ error: 'Eroare server. Încearcă din nou.' }, { status: 500 })
  }
}
