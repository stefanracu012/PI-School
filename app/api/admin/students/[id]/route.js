import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin, getCurrentUser } from '@/lib/session'
import { require2FAToken } from '@/lib/security/action-tokens'
import { checkPermission } from '@/lib/permissions'
import { hashPassword } from '@/lib/security/argon2'

export async function GET(request, { params }) {
  try {
    await requireAdmin()
    
    const canView = await checkPermission('students.view')
    if (!canView.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea de a vedea elevii' }, { status: 403 })
    }
    
    const { id } = await params

    const student = await prisma.student.findUnique({ where: { id } })
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    return NextResponse.json(student)
  } catch (error) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch student' }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
  try {
    await requireAdmin()
    
    const canEdit = await checkPermission('students.edit')
    if (!canEdit.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea de a edita elevii' }, { status: 403 })
    }
    
    const sessionUser = await getCurrentUser()
    const { id } = await params
    const body = await request.json()

    // Verify 2FA if user has it enabled
    const user = await prisma.user.findUnique({
      where: { email: sessionUser.email },
      select: { twoFactorEnabled: true }
    })
    
    const twoFACheck = require2FAToken(body.actionToken, sessionUser.email, user?.twoFactorEnabled)
    if (!twoFACheck.valid && !twoFACheck.skip) {
      return NextResponse.json({ 
        error: twoFACheck.error, 
        requires2FA: true 
      }, { status: 403 })
    }

    const { fullName, age, grade, parentName, parentPhone, parentEmail, notes, isAdult, level,
      startYear, startMonth, lessonType, locationType } = body

    const student = await prisma.student.update({
      where: { id },
      data: {
        fullName,
        age,
        grade: isAdult ? null : (grade ?? null),
        parentName: isAdult ? null : parentName,
        parentPhone,
        parentEmail,
        notes,
        ...(isAdult === undefined ? {} : { isAdult: !!isAdult }),
        ...(level === undefined ? {} : { level: level || null }),
        ...(startYear === undefined ? {} : { startYear: startYear ?? null }),
        ...(startMonth === undefined ? {} : { startMonth: startMonth ?? null }),
        ...(lessonType === undefined ? {} : { lessonType: lessonType || null }),
        ...(locationType === undefined ? {} : { locationType: locationType || null }),
      }
    })

    return NextResponse.json(student)
  } catch (error) {
    console.error('Error updating student:', error)
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to update student' }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  try {
    await requireAdmin()

    const canEdit = await checkPermission('students.edit')
    if (!canEdit.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea de a edita elevii' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()

    const allowedFields = [
      'superStudent', 'active', 'isAdult', 'level',
      'cooldownOverrideMin', 'dailyXpCapOverride',
      'cooldownDisabled', 'xpCapDisabled',
    ]
    const data = {}
    for (const key of allowedFields) {
      if (key in body) {
        const v = body[key]
        // normalize empty → null pentru câmpurile Int? override
        if ((key === 'cooldownOverrideMin' || key === 'dailyXpCapOverride') && (v === '' || v == null)) {
          data[key] = null
        } else if (key === 'cooldownOverrideMin' || key === 'dailyXpCapOverride') {
          const n = parseInt(v); if (Number.isFinite(n) && n >= 0) data[key] = n
        } else {
          data[key] = v
        }
      }
    }

    // Password (hash if provided, null to clear)
    if ('password' in body) {
      if (body.password === null || body.password === '') {
        data.password = null
      } else if (typeof body.password === 'string' && body.password.length >= 4) {
        data.password = await hashPassword(body.password)
      } else {
        return NextResponse.json({ error: 'Parola trebuie să aibă minim 4 caractere' }, { status: 400 })
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Niciun câmp valid de actualizat' }, { status: 400 })
    }

    const student = await prisma.student.update({ where: { id }, data })
    // Nu returnăm password hash
    return NextResponse.json({ ...student, password: undefined, hasPassword: !!student.password })
  } catch (error) {
    console.error('Error patching student:', error)
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to update student' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireAdmin()
    
    const canDelete = await checkPermission('students.delete')
    if (!canDelete.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea de a șterge elevii' }, { status: 403 })
    }
    
    const sessionUser = await getCurrentUser()
    const { id } = await params

    // Get action token from header or query
    const actionToken = request.headers.get('x-action-token')

    // Verify 2FA if user has it enabled
    const user = await prisma.user.findUnique({
      where: { email: sessionUser.email },
      select: { twoFactorEnabled: true }
    })
    
    const twoFACheck = require2FAToken(actionToken, sessionUser.email, user?.twoFactorEnabled)
    if (!twoFACheck.valid && !twoFACheck.skip) {
      return NextResponse.json({ 
        error: twoFACheck.error, 
        requires2FA: true 
      }, { status: 403 })
    }

    // Încărcăm elevul cu toate înregistrările în grupe + plățile asociate
    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        groupStudents: {
          include: {
            group: { select: { name: true } }
          }
        }
      }
    })

    if (!student) {
      return NextResponse.json({ error: 'Elevul nu a fost găsit' }, { status: 404 })
    }

    const groupStudentIds = student.groupStudents.map(gs => gs.id)
    const groupInfoByGsId = new Map(
      student.groupStudents.map(gs => [gs.id, {
        groupName: gs.group?.name || null,
        level: gs.group?.level || null,
      }])
    )

    // 1) Snapshot + detașare plăți (rămân în sistem după ștergerea elevului)
    if (groupStudentIds.length > 0) {
      const payments = await prisma.payment.findMany({
        where: { groupStudentId: { in: groupStudentIds } },
        select: { id: true, groupStudentId: true }
      })

      await Promise.all(payments.map(p => {
        const info = groupInfoByGsId.get(p.groupStudentId) || {}
        return prisma.payment.update({
          where: { id: p.id },
          data: {
            studentNameSnapshot: student.fullName,
            groupNameSnapshot: info.groupName,
            levelSnapshot: info.level,
            groupStudentId: null,
          }
        })
      }))
    }

    // 2) Ștergem elevul (cascade Prisma se va ocupa de groupStudents, attendances etc.)
    //    Plățile rămân detașate, cu snapshot pentru istoric
    await prisma.student.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting student:', error)
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to delete student', details: error.message }, { status: 500 })
  }
}
