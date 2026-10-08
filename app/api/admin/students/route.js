import { NextResponse } from 'next/server'
import { syncLeadForStudent } from '@/lib/student-leads'
import prisma from '@/lib/prisma'
import { requireAdmin, getCurrentUser } from '@/lib/session'
import { require2FAToken } from '@/lib/security/action-tokens'
import { checkPermission } from '@/lib/permissions'
import { ageRange } from '@/lib/age-groups'

const ITEMS_PER_PAGE = 20
const PAGE_SIZES = [20, 50, 100]

export async function GET(request) {
  try {
    await requireAdmin()

    // Verifică permisiunea de vizualizare elevi
    const canView = await checkPermission('students.view')
    if (!canView.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea de a vedea elevii' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')

    // Câți elevi pe pagină: una din valorile permise, sau toți
    const askedSize = searchParams.get('pageSize')
    const showAll = askedSize === 'all'
    const perPage = PAGE_SIZES.includes(parseInt(askedSize, 10))
      ? parseInt(askedSize, 10)
      : ITEMS_PER_PAGE
    const search = searchParams.get('search') || ''
    const hasGroup = searchParams.get('hasGroup') // 'yes', 'no', or empty
    const startPeriod = searchParams.get('startPeriod') // 'YYYY-MM', 'none' sau gol
    const ageGroup = searchParams.get('ageGroup') // ex. '7-8', 'adulti'
    const locationType = searchParams.get('locationType') // 'online' | 'offline'
    const lessonType = searchParams.get('lessonType') // 'grup' | 'individual'
    const all = searchParams.get('all') === 'true' // Pentru dropdown-uri

    // Construiește where clause
    const where = {}

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { parentName: { contains: search, mode: 'insensitive' } },
        { parentPhone: { contains: search, mode: 'insensitive' } },
        { parentEmail: { contains: search, mode: 'insensitive' } }
      ]
    }

    // Online sau la sediu
    if (locationType) where.locationType = locationType
    if (lessonType) where.lessonType = lessonType

    // Filtru pentru elevi cu/fără grupă
    if (hasGroup === 'yes') {
      where.groupStudents = { some: {} }
    } else if (hasGroup === 'no') {
      where.groupStudents = { none: {} }
    }

    // Categoria de vârstă: la adulți contează bifa, nu vârsta exactă
    if (ageGroup === 'adulti') {
      const range = ageRange('adulti')
      where.OR = [...(where.OR || []), { isAdult: true }, { age: range }]
    } else if (ageGroup) {
      const range = ageRange(ageGroup)
      if (range) {
        where.age = range
        where.isAdult = false
      }
    }

    // Filtru după luna de început
    if (startPeriod === 'none') {
      where.startMonth = null
    } else if (startPeriod) {
      const [y, m] = startPeriod.split('-').map((v) => parseInt(v, 10))
      if (Number.isFinite(y) && Number.isFinite(m)) {
        where.startYear = y
        where.startMonth = m
      }
    }

    // Dacă se cere all, returnează toți elevii (pentru dropdown-uri)
    if (all) {
      const students = await prisma.student.findMany({
        where,
        orderBy: { fullName: 'asc' },
        include: {
          groupStudents: {
            include: {
              group: {
                select: { id: true, name: true, billingType: true }
              }
            }
          }
        }
      })
      return NextResponse.json(students)
    }

    // Calculează totalul pentru paginare
    const totalCount = await prisma.student.count({ where })
    const totalPages = showAll ? 1 : Math.max(1, Math.ceil(totalCount / perPage))

    const students = await prisma.student.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(showAll ? {} : { skip: (page - 1) * perPage, take: perPage }),
      include: {
        groupStudents: {
          include: {
            group: {
              select: { id: true, name: true }
            }
          }
        }
      }
    })

    // Lunile care chiar există în date — filtrul nu inventează opțiuni goale
    const withStart = await prisma.student.findMany({
      where: { startMonth: { not: null } },
      select: { startYear: true, startMonth: true },
    })
    const periodCounts = new Map()
    for (const st of withStart) {
      if (!st.startYear || !st.startMonth) continue
      const key = `${st.startYear}-${String(st.startMonth).padStart(2, '0')}`
      periodCounts.set(key, (periodCounts.get(key) || 0) + 1)
    }
    const startPeriods = [...periodCounts.entries()]
      .map(([value, count]) => ({
        value,
        year: parseInt(value.slice(0, 4), 10),
        month: parseInt(value.slice(5, 7), 10),
        count,
      }))
      .sort((a, b) => a.value.localeCompare(b.value))

    return NextResponse.json({
      students,
      startPeriods,
      pagination: {
        page: showAll ? 1 : page,
        pageSize: showAll ? 'all' : perPage,
        totalPages,
        totalCount,
        hasMore: !showAll && page < totalPages
      }
    })
  } catch (error) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await requireAdmin()

    // Verifică permisiunea de creare elevi
    const canCreate = await checkPermission('students.create')
    if (!canCreate.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea de a crea elevi' }, { status: 403 })
    }

    const sessionUser = await getCurrentUser()
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

    const student = await prisma.student.create({
      data: {
        fullName,
        age,
        grade: isAdult ? null : (grade ?? null),
        parentName: isAdult ? null : parentName,
        parentPhone,
        parentEmail,
        notes,
        isAdult: !!isAdult,
        level: level || null,
        startYear: startYear ?? null,
        startMonth: startMonth ?? null,
        lessonType: lessonType || null,
        locationType: locationType || null,
      }
    })

    // Elevul își are lead-ul lui; statusul urmează grupele (Studiază / Waitlist)
    syncLeadForStudent(student.id).catch(() => {})

    return NextResponse.json(student, { status: 201 })
  } catch (error) {
    console.error('Error creating student:', error)
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to create student' }, { status: 500 })
  }
}
