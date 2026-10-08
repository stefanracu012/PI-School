import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { NOT_COMPLETED } from '@/lib/group-filters'

// Endpoint pentru orarul complet - accesibil tuturor utilizatorilor autentificați
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Administrația vede tot; un profesor, doar dacă i s-a dat dreptul
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, canViewAllSchedules: true },
    })
    const canViewAll =
      ['SUPERADMIN', 'ADMIN'].includes(me?.role) || !!me?.canViewAllSchedules

    // Filtrul se aplică din interogare, nu în pagină: altfel orarul colegilor
    // ar ajunge oricum în browser, doar ascuns.
    const onlyMine = canViewAll ? {} : { teacherId: session.user.id }

    // Fetch all active groups with necessary relations
    const groups = await prisma.group.findMany({
      where: {
        active: true,
        ...NOT_COMPLETED,
        ...onlyMine,
      },
      include: {
        branch: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true, email: true } },
        groupStudents: {
          where: { status: { notIn: ['LEFT', 'TRANSFERRED'] } },
          select: { id: true, status: true }
        }
      },
      orderBy: { name: 'asc' }
    })

    // Fetch all teachers for filter
    const teachers = await prisma.user.findMany({
      where: canViewAll
        ? { role: 'TEACHER', active: true }
        : { id: session.user.id },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' }
    })

    // Fetch all branches for filter
    const branches = await prisma.branch.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    })

    // Fetch scheduled makeup lessons (SCHEDULED or IN_PROGRESS)
    const makeupLessons = await prisma.makeupLesson.findMany({
      where: {
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        ...onlyMine,
      },
      include: {
        group: {
          select: { id: true, name: true }
        },
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

    return NextResponse.json({
      groups,
      teachers,
      branches,
      makeupLessons,
      currentUserId: session.user.id,
      canViewAll,
    })
  } catch (error) {
    console.error('Error fetching schedule:', error)
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 })
  }
}
