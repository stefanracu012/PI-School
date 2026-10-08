import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { NOT_COMPLETED, IS_COMPLETED } from '@/lib/group-filters'
import { parseSchoolDate } from '@/lib/timezone'
import { requireAdmin, getCurrentUser } from '@/lib/session'
import { require2FAToken } from '@/lib/security/action-tokens'
import { checkPermission } from '@/lib/permissions'
import { sendTeacherDirectMessage } from '@/lib/telegram'
import { parseGroupSalary, SALARY_PERMISSION } from '@/lib/salary'

const ITEMS_PER_PAGE = 20

export async function GET(request) {
  try {
    await requireAdmin()
    
    const canView = await checkPermission('groups.view')
    if (!canView.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea de a vedea grupele' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const search = searchParams.get('search') || ''
    const teacherId = searchParams.get('teacherId') || ''
    const branchId = searchParams.get('branchId') || ''
    const day = searchParams.get('day') || ''
    const all = searchParams.get('all') === 'true' // Pentru a obține toate (pentru filtre)
    // 'active' (implicit) = grupele în curs, 'completed' = cele terminate,
    // 'all' = amândouă. Grupele terminate nu trebuie să încurce nicăieri.
    const status = searchParams.get('status') || 'active'

    // Build where clause
    const where = {}

    // Căutarea își pune propriul OR, așa că starea grupei intră pe AND —
    // altfel una din cele două condiții ar călca peste cealaltă.
    if (status === 'completed') Object.assign(where, IS_COMPLETED)
    else if (status !== 'all') where.AND = [...(where.AND || []), NOT_COMPLETED]
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { level: { contains: search, mode: 'insensitive' } },
        { teacher: { name: { contains: search, mode: 'insensitive' } } },
        { teacher: { email: { contains: search, mode: 'insensitive' } } },
        { branch: { name: { contains: search, mode: 'insensitive' } } },
        { groupStudents: { some: { student: { fullName: { contains: search, mode: 'insensitive' } } } } }
      ]
    }
    
    if (teacherId) {
      where.teacherId = teacherId
    }
    
    if (branchId) {
      if (branchId === 'none') {
        where.branchId = null
      } else {
        where.branchId = branchId
      }
    }
    
    if (day) {
      where.scheduleDays = { has: day }
    }

    // Get total count for pagination
    const totalCount = await prisma.group.count({ where })
    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

    // Get paginated groups
    const groups = await prisma.group.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: all ? 0 : (page - 1) * ITEMS_PER_PAGE,
      take: all ? undefined : ITEMS_PER_PAGE,
      include: { 
        teacher: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        branch: true,
        groupStudents: {
          include: {
            student: true
          }
        }
      }
    })

    // Get teachers and branches for filters (always return all)
    const [teachers, branches, makeupLessons] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'TEACHER' },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' }
      }),
      prisma.branch.findMany({
        where: { active: true },
        orderBy: { name: 'asc' }
      }),
      // Fetch scheduled makeup lessons for schedule view
      prisma.makeupLesson.findMany({
        where: {
          status: { in: ['SCHEDULED', 'IN_PROGRESS'] }
        },
        include: {
          group: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true, email: true } },
          students: {
            include: {
              student: { select: { id: true, fullName: true } }
            }
          }
        },
        orderBy: { scheduledAt: 'asc' }
      })
    ])
    
    return NextResponse.json({ 
      groups, 
      teachers, 
      branches,
      makeupLessons,
      pagination: {
        page,
        totalPages,
        totalCount,
        hasMore: page < totalPages
      }
    })
  } catch (error) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await requireAdmin()
    
    const canCreate = await checkPermission('groups.create')
    if (!canCreate.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea de a crea grupe' }, { status: 403 })
    }
    
    const sessionUser = await getCurrentUser()
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
            locationType, locationDetails, startDate, active, monthlyLessons, isTrial, trialDate, billingType, notes } = body

    // Plata profesorului o pune doar cine se ocupă de salarii
    const canSetSalary = (await checkPermission(SALARY_PERMISSION)).allowed

    const group = await prisma.group.create({
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
        monthlyLessons: parseInt(monthlyLessons, 10) || 8,
        billingType: billingType === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'MONTHLY',
        notes: notes?.trim() || null,
        isTrial: !!isTrial,
        trialDate: isTrial ? parseSchoolDate(trialDate) : null,
        // O probă nu se repetă săptămânal
        ...(isTrial ? { scheduleDays: [], scheduleTime: null } : {}),
        active
      },
      include: {
        branch: { select: { name: true } },
        teacher: { select: { name: true, telegramChatId: true } }
      }
    })

    // Trimite notificare pe Telegram către profesor
    if (group.teacher?.telegramChatId && teacherId) {
      // Parse scheduleTime - poate fi JSON sau string simplu
      let timeDisplay = scheduleTime || 'Neprecizat'
      if (scheduleTime && scheduleTime.startsWith('{')) {
        try {
          const times = JSON.parse(scheduleTime)
          // Formatează ca: Luni la 12:00, Vineri la 19:00
          const days = scheduleDays || Object.keys(times)
          timeDisplay = days
            .filter(day => times[day])
            .map(day => `${day} la ${times[day]}`)
            .join(', ')
        } catch {
          // Lasă ca string simplu
        }
      }
      
      const scheduleInfo = scheduleDays?.length > 0 
        ? `📅 ${timeDisplay}`
        : 'Program nestabilit'
      
      const message = `🎉 <b>Grupă Nouă Atribuită!</b>

📚 Grupă: <b>${group.name}</b>
📘 Nivel: ${group.level || 'Nespecificat'}
${group.branch ? `🏢 Filială: ${group.branch.name}` : ''}
${scheduleInfo}
${locationDetails ? `📍 Locație: ${locationDetails}` : ''}
${locationType === 'online' ? '💻 Online' : '🏫 Fizic'}

✨ Mult succes cu noua grupă!`

      await sendTeacherDirectMessage(group.teacher.telegramChatId, message, group.teacher.name)
    }

    return NextResponse.json(group, { status: 201 })
  } catch (error) {
    console.error('Error creating group:', error)
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 })
  }
}
