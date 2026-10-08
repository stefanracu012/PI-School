import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Plățile rămase fără elev — cele ale elevilor șterși.
 *
 * Când se șterge un elev, plățile lui nu dispar: li se pune numele în
 * snapshot și li se rupe legătura (`groupStudentId: null`), ca încasările de
 * atunci să rămână în istoric. De aici se pot curăța, când administrația
 * chiar vrea să scape de ele.
 *
 * Ștergerea e definitivă și scade încasările din rapoarte, așa că GET-ul
 * arată întâi exact ce urmează să dispară, iar DELETE-ul e doar pentru
 * superadmin.
 */

export const dynamic = 'force-dynamic'

async function requireSuperadmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Neautentificat' }, { status: 401 }) }
  }
  if (session.user.role !== 'SUPERADMIN') {
    return {
      error: NextResponse.json(
        { error: 'Doar superadminul poate șterge plățile elevilor șterși' },
        { status: 403 }
      ),
    }
  }
  return { session }
}

/** Plata a rămas fără elev: legătura e ruptă. */
const ORPHAN_WHERE = { groupStudentId: null }

// GET — ce s-ar șterge, fără să se șteargă nimic
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payments = await prisma.payment.findMany({
      where: ORPHAN_WHERE,
      select: {
        id: true, amount: true, debt: true, paymentDate: true,
        studentNameSnapshot: true, groupNameSnapshot: true, lessonsAdded: true,
      },
      orderBy: { paymentDate: 'desc' },
    })

    // Strânse pe elev, ca lista să se citească: cine, câte plăți, cât
    const byStudent = new Map()
    for (const p of payments) {
      const name = p.studentNameSnapshot || 'Elev necunoscut'
      if (!byStudent.has(name)) {
        byStudent.set(name, { name, payments: 0, amount: 0, groups: new Set(), lastPaymentAt: null })
      }
      const row = byStudent.get(name)
      row.payments++
      row.amount += p.amount || 0
      if (p.groupNameSnapshot) row.groups.add(p.groupNameSnapshot)
      if (!row.lastPaymentAt || new Date(p.paymentDate) > new Date(row.lastPaymentAt)) {
        row.lastPaymentAt = p.paymentDate
      }
    }

    const students = [...byStudent.values()]
      .map((r) => ({ ...r, amount: Math.round(r.amount), groups: [...r.groups] }))
      .sort((a, b) => b.amount - a.amount)

    return NextResponse.json({
      count: payments.length,
      totalAmount: Math.round(payments.reduce((s, p) => s + (p.amount || 0), 0)),
      students,
      canDelete: session.user.role === 'SUPERADMIN',
    })
  } catch (error) {
    console.error('Eroare la citirea plăților fără elev:', error)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}

// DELETE — șterge definitiv plățile rămase fără elev
export async function DELETE(request) {
  const { error, session } = await requireSuperadmin()
  if (error) return error

  try {
    // Numărul văzut la previzualizare trebuie să fie și cel de acum: dacă
    // între timp s-a mai șters un elev, ne oprim și cerem o nouă confirmare.
    const expected = new URL(request.url).searchParams.get('expected')
    const current = await prisma.payment.count({ where: ORPHAN_WHERE })

    if (expected != null && parseInt(expected, 10) !== current) {
      return NextResponse.json({
        error: `Între timp numărul s-a schimbat (${current} acum, ${expected} la verificare). ` +
          'Mai uită-te o dată peste listă.',
        count: current,
      }, { status: 409 })
    }

    const { count } = await prisma.payment.deleteMany({ where: ORPHAN_WHERE })

    console.log(`[plăți] ${session.user.email} a șters ${count} plăți ale elevilor șterși`)

    return NextResponse.json({ success: true, deleted: count })
  } catch (error) {
    console.error('Eroare la ștergerea plăților fără elev:', error)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}
