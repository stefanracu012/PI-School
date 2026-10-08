import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin, getCurrentUser } from '@/lib/session'
import { require2FAToken } from '@/lib/security/action-tokens'
import { checkPermission } from '@/lib/permissions'

export async function GET(request, { params }) {
  try {
    await requireAdmin()
    
    // Check permission
    const permCheck = await checkPermission('branches.view')
    if (!permCheck.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea să vezi filialele' }, { status: 403 })
    }
    
    const { id } = await params
    
    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        groups: {
          include: { teacher: true }
        }
      }
    })

    if (!branch) {
      return NextResponse.json({ error: 'Filiala nu a fost găsită' }, { status: 404 })
    }

    return NextResponse.json(branch)
  } catch (error) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch branch' }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
  try {
    await requireAdmin()
    
    // Check permission
    const permCheck = await checkPermission('branches.edit')
    if (!permCheck.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea să editezi filiale' }, { status: 403 })
    }
    
    const sessionUser = await getCurrentUser()
    const { id } = await params
    const body = await request.json()

    // Verify 2FA if user has it enabled
    const currentUser = await prisma.user.findUnique({
      where: { email: sessionUser.email },
      select: { twoFactorEnabled: true }
    })
    
    const twoFACheck = require2FAToken(body.actionToken, sessionUser.email, currentUser?.twoFactorEnabled)
    if (!twoFACheck.valid && !twoFACheck.skip) {
      return NextResponse.json({ 
        error: twoFACheck.error, 
        requires2FA: true 
      }, { status: 403 })
    }

    const { name, address, active } = body

    // Check if another branch with same name exists
    const existingBranch = await prisma.branch.findFirst({
      where: { 
        name,
        id: { not: id }
      }
    })

    if (existingBranch) {
      return NextResponse.json({ error: 'O altă filială cu acest nume există deja' }, { status: 400 })
    }

    const branch = await prisma.branch.update({
      where: { id },
      data: {
        name,
        address: address || null,
        active: active ?? true
      }
    })

    return NextResponse.json(branch)
  } catch (error) {
    console.error('Error updating branch:', error)
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Filiala nu a fost găsită' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to update branch' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireAdmin()
    
    // Check permission
    const permCheck = await checkPermission('branches.delete')
    if (!permCheck.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea să ștergi filiale' }, { status: 403 })
    }
    
    const sessionUser = await getCurrentUser()
    const { id } = await params

    // Check for action token in header or query params
    const actionToken = request.headers.get('x-action-token') || new URL(request.url).searchParams.get('actionToken')

    // Verify 2FA if user has it enabled
    const currentUser = await prisma.user.findUnique({
      where: { email: sessionUser.email },
      select: { twoFactorEnabled: true }
    })
    
    const twoFACheck = require2FAToken(actionToken, sessionUser.email, currentUser?.twoFactorEnabled)
    if (!twoFACheck.valid && !twoFACheck.skip) {
      return NextResponse.json({ 
        error: twoFACheck.error, 
        requires2FA: true 
      }, { status: 403 })
    }

    // Check if branch has groups
    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        _count: {
          select: { groups: true }
        }
      }
    })

    if (!branch) {
      return NextResponse.json({ error: 'Filiala nu a fost găsită' }, { status: 404 })
    }

    if (branch._count.groups > 0) {
      return NextResponse.json({ 
        error: `Nu poți șterge filiala deoarece are ${branch._count.groups} grupe asociate. Mută mai întâi grupele la altă filială.` 
      }, { status: 400 })
    }

    await prisma.branch.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting branch:', error)
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to delete branch' }, { status: 500 })
  }
}
