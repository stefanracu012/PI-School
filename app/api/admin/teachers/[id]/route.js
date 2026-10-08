import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { hashPassword } from '@/lib/security/argon2'
import { requireAdmin, getCurrentUser } from '@/lib/session'
import { require2FAToken } from '@/lib/security/action-tokens'
import { checkPermission } from '@/lib/permissions'

export async function PUT(request, { params }) {
  try {
    await requireAdmin()
    
    // Check permission
    const permCheck = await checkPermission('teachers.edit')
    if (!permCheck.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea să editezi conturi' }, { status: 403 })
    }
    
    const sessionUser = await getCurrentUser()
    const { id } = await params
    const body = await request.json()

    // Verify 2FA if user has it enabled
    const currentUser = await prisma.user.findUnique({
      where: { email: sessionUser.email },
      select: { twoFactorEnabled: true, role: true }
    })
    
    // Check if trying to edit an admin - only SUPERADMIN can do that
    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { role: true }
    })
    
    if (targetUser && ['ADMIN'].includes(targetUser.role) && currentUser?.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Doar superadmin poate modifica alți administratori' }, { status: 403 })
    }
    
    const twoFACheck = require2FAToken(body.actionToken, sessionUser.email, currentUser?.twoFactorEnabled)
    if (!twoFACheck.valid && !twoFACheck.skip) {
      return NextResponse.json({ 
        error: twoFACheck.error, 
        requires2FA: true 
      }, { status: 403 })
    }

    const { name, phone, telegramChatId, password, active, twoFactorAllowed, superTeacher, canViewAllSchedules, role, permissions } = body

    const updateData = { name, phone: phone || null, telegramChatId: telegramChatId || null, active, twoFactorAllowed, superTeacher: !!superTeacher, canViewAllSchedules: !!canViewAllSchedules }
    
    if (password) {
      updateData.password = await hashPassword(password)
      
      // Invalidate all sessions when password is changed
      await prisma.authSession.deleteMany({
        where: { userId: id }
      })
    }

    // Only SUPERADMIN can change role and permissions
    if (currentUser?.role === 'SUPERADMIN') {
      if (role && ['TEACHER', 'ADMIN'].includes(role)) {
        updateData.role = role
      }
      if (Array.isArray(permissions)) {
        // La profesor păstrăm doar drepturile lui; restul n-au unde fi folosite
        const finalRole = role || targetUser?.role
        updateData.permissions = finalRole === 'TEACHER'
          ? permissions.filter((k) => k.startsWith('teacher.'))
          : permissions
      }
    }

    const teacher = await prisma.user.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json(teacher)
  } catch (error) {
    console.error('Error updating teacher:', error)
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to update teacher' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireAdmin()
    
    // Check permission
    const permCheck = await checkPermission('teachers.delete')
    if (!permCheck.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea să ștergi conturi' }, { status: 403 })
    }
    
    const sessionUser = await getCurrentUser()
    const { id } = await params

    // Get action token from header
    const actionToken = request.headers.get('x-action-token')

    // Verify 2FA if user has it enabled
    const currentUser = await prisma.user.findUnique({
      where: { email: sessionUser.email },
      select: { twoFactorEnabled: true, role: true }
    })
    
    // Check if trying to delete an admin - only SUPERADMIN can do that
    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { role: true }
    })
    
    if (targetUser && ['ADMIN'].includes(targetUser.role) && currentUser?.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Doar superadmin poate șterge alți administratori' }, { status: 403 })
    }
    
    const twoFACheck = require2FAToken(actionToken, sessionUser.email, currentUser?.twoFactorEnabled)
    if (!twoFACheck.valid && !twoFACheck.skip) {
      return NextResponse.json({ 
        error: twoFACheck.error, 
        requires2FA: true 
      }, { status: 403 })
    }

    // Invalidate all sessions before deleting user
    await prisma.authSession.deleteMany({
      where: { userId: id }
    })

    await prisma.user.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to delete teacher' }, { status: 500 })
  }
}
