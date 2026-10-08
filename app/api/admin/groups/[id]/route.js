import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { parseSchoolDate } from '@/lib/timezone'
import { requireAdmin, getCurrentUser } from '@/lib/session'
import { require2FAToken } from '@/lib/security/action-tokens'
import { checkPermission } from '@/lib/permissions'
import { parseGroupSalary, SALARY_PERMISSION } from '@/lib/salary'

export async function GET(request, { params }) {
  try {
    await requireAdmin()
    
    const canView = await checkPermission('groups.view')
    if (!canView.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea de a vedea grupele' }, { status: 403 })
    }
    
    const { id } = await params

    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        teacher: {
          select: { id: true, name: true, email: true }
        },
        branch: true,
        groupStudents: {
          include: {
            student: true
          },
          orderBy: {
            student: { fullName: 'asc' }
          }
        }
      }
    })

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    return NextResponse.json(group)
  } catch (error) {
    console.error('Error fetching group:', error)
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch group' }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
  try {
    await requireAdmin()
    
    const canEdit = await checkPermission('groups.edit')
    if (!canEdit.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea de a edita grupele' }, { status: 403 })
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

    const { name, level, teacherId, branchId, scheduleDays, scheduleTime,
            locationType, locationDetails, startDate, active, monthlyLessons, isTrial, trialDate, billingType, notes,
            cooldownOverrideMin, dailyXpCapOverride,
            cooldownDisabled, xpCapDisabled } = body

    // Normalizare override-uri
    const norm = (v) => (v === '' || v == null) ? null : (Number.isFinite(parseInt(v)) ? parseInt(v) : null)

    // Plata profesorului o schimbă doar cine se ocupă de salarii.
    // Lecțiile deja ținute își păstrează suma de atunci.
    const canSetSalary = (await checkPermission(SALARY_PERMISSION)).allowed

    const group = await prisma.group.update({
      where: { id },
      data: {
        name,
        ...(canSetSalary ? parseGroupSalary(body) : {}),
        level: level || null,
        teacherId,
        branchId: branchId || null,
        scheduleDays,
        scheduleTime,
        locationType,
        locationDetails,
        startDate: startDate ? new Date(startDate) : null,
        ...(monthlyLessons !== undefined ? { monthlyLessons: parseInt(monthlyLessons, 10) || 8 } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
        ...(billingType !== undefined
          ? { billingType: billingType === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'MONTHLY' }
          : {}),
        ...(isTrial !== undefined ? { isTrial: !!isTrial } : {}),
        ...(isTrial !== undefined
          ? isTrial
            ? { trialDate: parseSchoolDate(trialDate), scheduleDays: [], scheduleTime: null }
            : { trialDate: null }
          : {}),
        active,
        ...(cooldownOverrideMin !== undefined ? { cooldownOverrideMin: norm(cooldownOverrideMin) } : {}),
        ...(dailyXpCapOverride !== undefined  ? { dailyXpCapOverride:  norm(dailyXpCapOverride) }  : {}),
        ...(cooldownDisabled !== undefined    ? { cooldownDisabled: !!cooldownDisabled }            : {}),
        ...(xpCapDisabled !== undefined       ? { xpCapDisabled:    !!xpCapDisabled }               : {}),
      }
    })

    return NextResponse.json(group)
  } catch (error) {
    console.error('Error updating group:', error)
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to update group' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireAdmin()
    
    const canDelete = await checkPermission('groups.delete')
    if (!canDelete.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea de a șterge grupele' }, { status: 403 })
    }
    
    const sessionUser = await getCurrentUser()
    const { id } = await params

    // Get action token from header
    const actionToken = request.headers.get('x-action-token')

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

    // Încărcăm grupa cu detaliile + groupStudents pentru snapshot plăți
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        groupStudents: {
          include: { student: { select: { fullName: true } } }
        }
      }
    })

    if (!group) {
      return NextResponse.json({ error: 'Grupa nu a fost găsită' }, { status: 404 })
    }

    const groupStudentIds = group.groupStudents.map(gs => gs.id)
    const studentNamesByGsId = new Map(
      group.groupStudents.map(gs => [gs.id, gs.student?.fullName || 'Elev necunoscut'])
    )

    // Sesiunile de lecție ale grupei (pentru ștergerea attendance-urilor)
    const lessonSessions = await prisma.lessonSession.findMany({
      where: { groupId: id },
      select: { id: true }
    })
    const lessonSessionIds = lessonSessions.map(s => s.id)

    // 1) Snapshot + detașare plăți (rămân în sistem cu istoricul lor)
    if (groupStudentIds.length > 0) {
      const payments = await prisma.payment.findMany({
        where: { groupStudentId: { in: groupStudentIds } },
        select: { id: true, groupStudentId: true }
      })

      // Update fiecare plată cu snapshot + detașare (groupStudentId → null)
      await Promise.all(payments.map(p =>
        prisma.payment.update({
          where: { id: p.id },
          data: {
            studentNameSnapshot: studentNamesByGsId.get(p.groupStudentId) || null,
            groupNameSnapshot: group.name,
            levelSnapshot: group.level || null,
            groupStudentId: null,
          }
        })
      ))
    }

    // 2) Ștergere referințe doar pentru această grupă (elevii rămân în alte grupe)
    //    NU folosim cascade Prisma (poate eșua pe MongoDB) — facem totul explicit
    if (lessonSessionIds.length > 0) {
      await prisma.attendance.deleteMany({ where: { sessionId: { in: lessonSessionIds } } })
    }
    await prisma.lessonTransaction.deleteMany({ where: { groupId: id } })
    await prisma.lessonSession.deleteMany({ where: { groupId: id } })
    await prisma.missedSession.deleteMany({ where: { groupId: id } })
    await prisma.makeupLesson.deleteMany({ where: { groupId: id } }).catch(() => {})
    await prisma.notification.deleteMany({ where: { groupId: id } })
    await prisma.groupStudent.deleteMany({ where: { groupId: id } })

    // 3) Ștergem grupa în sine
    await prisma.group.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting group:', error)
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to delete group', details: error.message }, { status: 500 })
  }
}
