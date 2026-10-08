import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { matchScore, hasSomethingToMatch } from '@/lib/duplicates'
import { getStatus } from '@/lib/leads-config'

/**
 * Există deja un lead cu numele sau telefonul ăsta?
 *
 * Aceleași reguli ca la elevi (lib/duplicates.js). Se compară și cu numele
 * elevului din lead — la copii, părintele scrie, dar noi îl știm pe copil.
 * Arătăm și elevii existenți: un lead nou poate fi cineva care deja învață.
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
  const excludeId = searchParams.get('exclude') || null

  if (!hasSomethingToMatch(typed)) return NextResponse.json({ matches: [] })

  const [leads, students] = await Promise.all([
    prisma.lead.findMany({
      select: {
        id: true, name: true, studentName: true, phone: true,
        status: true, source: true, createdAt: true,
        assignedTo: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.student.findMany({
      select: { id: true, fullName: true, parentName: true, parentPhone: true },
    }),
  ])

  const matches = []

  for (const l of leads) {
    if (l.id === excludeId) continue
    const hit = matchScore(typed, { names: [l.name, l.studentName], phones: [l.phone] })
    if (!hit) continue
    const st = getStatus(l.status)
    matches.push({
      kind: 'lead',
      id: l.id,
      name: l.name,
      studentName: l.studentName,
      phone: l.phone,
      status: `${st.emoji} ${st.label}`,
      assignedTo: l.assignedTo?.name || null,
      addedAt: l.createdAt.toISOString(),
      ...hit,
    })
  }

  for (const s of students) {
    const hit = matchScore(typed, { names: [s.fullName, s.parentName], phones: [s.parentPhone] })
    if (!hit) continue
    matches.push({
      kind: 'student',
      id: s.id,
      name: s.fullName,
      phone: s.parentPhone,
      ...hit,
    })
  }

  matches.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ro'))

  return NextResponse.json({
    matches: matches.slice(0, 6),
    total: matches.length,
    strong: matches.some((m) => m.score >= 2),
  })
}
