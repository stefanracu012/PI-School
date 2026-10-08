import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !['TEACHER', 'ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const skip = Math.max(0, parseInt(searchParams.get('skip') || '0', 10))
    const take = Math.min(50, Math.max(1, parseInt(searchParams.get('take') || '20', 10)))

    const sessions = await prisma.lessonSession.findMany({
      where: {
        group: { teacherId: session.user.id }
      },
      select: {
        id: true,
        date: true,
        groupId: true,
        lessonsDeducted: true,
        group: {
          select: {
            name: true,
            }
        },
        attendances: { select: { status: true } }
      },
      orderBy: { date: 'desc' },
      skip,
      take,
    })

    const serialized = sessions.map(s => ({
      ...s,
      date: s.date instanceof Date ? s.date.toISOString() : s.date,
    }))

    return NextResponse.json({
      sessions: serialized,
      hasMore: serialized.length === take,
    })
  } catch (e) {
    console.error('attendance history error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
