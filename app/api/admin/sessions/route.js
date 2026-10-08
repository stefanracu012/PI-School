import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/permissions'

/**
 * Sesiunile de lecții, pentru /admin/sessions.
 *
 * Filtrarea și paginarea se fac aici, nu în pagină: școala adună sute de
 * lecții pe lună și nu are rost să ajungă toate în browser ca să se vadă
 * douăzeci.
 */

const PAGE_SIZES = [20, 50, 100]

export async function GET(request) {
  const session = await getServerSession(authOptions)

  if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const permCheck = await checkPermission('sessions.view')
  if (!permCheck.allowed) {
    return NextResponse.json({ error: 'Nu ai permisiunea să vezi sesiunile' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)

    const teacherId = searchParams.get('teacherId') || ''
    const groupId = searchParams.get('groupId') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const asked = parseInt(searchParams.get('pageSize') || '', 10)
    const pageSize = PAGE_SIZES.includes(asked) ? asked : 20

    const where = {}
    if (groupId) where.groupId = groupId
    else if (teacherId) where.group = { teacherId }

    // Id-urile filtrate, o dată: din ele ies și numărul total, și prezențele.
    const filtered = await prisma.lessonSession.findMany({ where, select: { id: true } })
    const ids = filtered.map((s) => s.id)
    const totalCount = ids.length

    const [sessions, teachers, groups, attendanceTotal, presentTotal] = await Promise.all([
      prisma.lessonSession.findMany({
        where,
        include: {
          group: {
            include: { teacher: { select: { id: true, name: true, email: true } } },
          },
          attendances: { include: { student: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.findMany({
        where: { role: 'TEACHER' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.group.findMany({
        select: { id: true, name: true, level: true, teacherId: true },
        orderBy: { name: 'asc' },
      }),
      // Cifrele de sus se numără pe tot ce trece filtrul, nu doar pe pagina
      // deschisă — altfel „Prezenți" ar scădea la fiecare pagină.
      prisma.attendance.count({ where: { sessionId: { in: ids } } }),
      prisma.attendance.count({ where: { sessionId: { in: ids }, status: 'PRESENT' } }),
    ])

    return NextResponse.json({
      sessions,
      teachers,
      groups,
      page,
      pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      stats: {
        total: totalCount,
        totalStudents: attendanceTotal,
        present: presentTotal,
        absent: attendanceTotal - presentTotal,
      },
    })
  } catch (error) {
    console.error('Error fetching sessions:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
