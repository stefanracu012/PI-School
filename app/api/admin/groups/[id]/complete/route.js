import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/permissions'

/**
 * Încheierea unei grupe.
 *
 * Grupa care și-a terminat cursul nu se șterge — istoricul ei (lecții,
 * prezențe, plăți) rămâne întreg și se poate vedea oricând filtrând după
 * „terminate". Ce se schimbă e că iese din listele de zi cu zi, din orar și
 * din notificările de pe Telegram, ca să nu mai stea în drum.
 *
 * Se poate și redeschide, dacă grupa a fost încheiată din greșeală.
 */

export const dynamic = 'force-dynamic'

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions)
  if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const perm = await checkPermission('groups.edit')
  if (!perm.allowed) {
    return NextResponse.json({ error: 'Nu ai permisiunea să modifici grupe' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const reopen = body.reopen === true

    const group = await prisma.group.findUnique({
      where: { id },
      select: { id: true, name: true, completedAt: true },
    })
    if (!group) {
      return NextResponse.json({ error: 'Grupa nu există' }, { status: 404 })
    }

    const updated = await prisma.group.update({
      where: { id },
      data: reopen
        ? { completedAt: null, completedById: null }
        : { completedAt: new Date(), completedById: session.user.id },
      select: { id: true, name: true, completedAt: true },
    })

    console.log(
      `[grupe] ${session.user.email} a ${reopen ? 'redeschis' : 'încheiat'} grupa „${group.name}"`
    )

    return NextResponse.json({
      success: true,
      completed: !reopen,
      group: updated,
    })
  } catch (error) {
    console.error('Eroare la încheierea grupei:', error)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}
