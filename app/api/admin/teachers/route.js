import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { hashPassword } from '@/lib/security/argon2'
import { requireAdmin, getCurrentUser } from '@/lib/session'
import { require2FAToken } from '@/lib/security/action-tokens'
import { checkPermission } from '@/lib/permissions'

export async function GET() {
  try {
    await requireAdmin()
    const teachers = await prisma.user.findMany({
      where: { role: { in: ['TEACHER', 'ADMIN'] } },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(teachers)
  } catch (error) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch teachers' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await requireAdmin()
    
    // Check permission
    const permCheck = await checkPermission('teachers.create')
    if (!permCheck.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea să creezi conturi' }, { status: 403 })
    }
    
    const sessionUser = await getCurrentUser()
    const body = await request.json()

    // Verify 2FA if user has it enabled
    const currentUser = await prisma.user.findUnique({
      where: { email: sessionUser.email },
      select: { twoFactorEnabled: true, role: true }
    })
    
    const twoFACheck = require2FAToken(body.actionToken, sessionUser.email, currentUser?.twoFactorEnabled)
    if (!twoFACheck.valid && !twoFACheck.skip) {
      return NextResponse.json({ 
        error: twoFACheck.error, 
        requires2FA: true 
      }, { status: 403 })
    }

    const { name, email, phone, telegramChatId, password, active, twoFactorAllowed, superTeacher, canViewAllSchedules, role, permissions } = body

    // Doar SUPERADMIN poate crea ADMIN
    const allowedRoles = ['TEACHER']
    if (currentUser?.role === 'SUPERADMIN') {
      allowedRoles.push('ADMIN')
    }

    const finalRole = allowedRoles.includes(role) ? role : 'TEACHER'

    // Check if email exists
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return NextResponse.json({ error: 'Acest email există deja' }, { status: 400 })
    }

    const hashedPassword = password ? await hashPassword(password) : null

    // Profesorii pot avea și ei drepturi, dar numai pe acțiunile lor
    const requested = Array.isArray(permissions) ? permissions : []
    const finalPermissions = finalRole === 'TEACHER'
      ? requested.filter((k) => k.startsWith('teacher.'))
      : requested

    const teacher = await prisma.user.create({
      data: {
        name,
        email,
        phone: phone || null,
        telegramChatId: telegramChatId || null,
        password: hashedPassword,
        role: finalRole,
        permissions: finalPermissions,
        active: active ?? true,
        twoFactorAllowed: twoFactorAllowed ?? false,
        superTeacher: !!superTeacher && finalRole === 'TEACHER',
        canViewAllSchedules: !!canViewAllSchedules && finalRole === 'TEACHER'
      }
    })

    return NextResponse.json(teacher, { status: 201 })
  } catch (error) {
    console.error('Error creating teacher:', error)
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to create teacher' }, { status: 500 })
  }
}
