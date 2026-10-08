import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { matchScore, hasSomethingToMatch } from '@/lib/duplicates'

/**
 * Există deja un elev cu numele ăsta?
 *
 * Nu blochează nimic — doar spune ce seamănă, ca să nu se creeze din greșeală
 * al treilea „Popescu Maria". Regulile de potrivire stau în lib/duplicates.js,
 * comune cu verificarea de la leads.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['SUPERADMIN', 'ADMIN', 'TEACHER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const typed = {
    name: searchParams.get('name') || '',
    phone: searchParams.get('phone') || '',
  }

  if (!hasSomethingToMatch(typed)) return NextResponse.json({ matches: [] })

  const students = await prisma.student.findMany({
    select: {
      id: true,
      fullName: true,
      parentName: true,
      parentPhone: true,
      age: true,
      isAdult: true,
      createdAt: true,
      groupStudents: {
        where: { status: { notIn: ['LEFT', 'TRANSFERRED'] } },
        select: { group: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const matches = []
  for (const s of students) {
    const hit = matchScore(typed, { names: [s.fullName], phones: [s.parentPhone] })
    if (!hit) continue

    matches.push({
      id: s.id,
      fullName: s.fullName,
      parentName: s.parentName,
      parentPhone: s.parentPhone,
      age: s.age,
      isAdult: s.isAdult,
      groups: s.groupStudents.map((gs) => gs.group?.name).filter(Boolean),
      addedAt: s.createdAt.toISOString(),
      ...hit,
    })
  }

  matches.sort((a, b) => b.score - a.score || a.fullName.localeCompare(b.fullName, 'ro'))

  return NextResponse.json({
    matches: matches.slice(0, 6),
    total: matches.length,
    strong: matches.some((m) => m.score >= 2),
  })
}
