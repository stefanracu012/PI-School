import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import {
  currentSalaryUser,
  parsePeriod,
  currentMonth,
  salaryOverview,
  recentEntries,
  validateManualAmount,
  addManualEntry,
  getBalance,
} from '@/lib/salary'

const MANUAL_KINDS = ['BONUS', 'PAYOUT', 'ADJUSTMENT']

// GET ?month=YYYYMM — toți profesorii cu soldul și cifrele lunii, plus ultimele mișcări
export async function GET(request) {
  const me = await currentSalaryUser()
  if (!me) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })
  if (!me.access.view) return NextResponse.json({ error: 'Nu ai acces la salarii' }, { status: 403 })

  try {
    const { searchParams } = new URL(request.url)
    const month = parsePeriod(searchParams.get('month')) || currentMonth()
    const [overview, recent] = await Promise.all([salaryOverview(month), recentEntries(30)])
    return NextResponse.json({ ...overview, recent, access: me.access })
  } catch (error) {
    console.error('Eroare la salarii:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST — bonus, corectare sau salariu scos
export async function POST(request) {
  const me = await currentSalaryUser()
  if (!me) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })
  if (!me.access.edit) return NextResponse.json({ error: 'Nu ai dreptul să editezi salariile' }, { status: 403 })

  try {
    const body = await request.json()
    if (!MANUAL_KINDS.includes(body.kind)) {
      return NextResponse.json({ error: 'Tip necunoscut' }, { status: 400 })
    }
    if (!/^[a-f0-9]{24}$/.test(body.teacherId || '')) {
      return NextResponse.json({ error: 'Profesor invalid' }, { status: 400 })
    }

    const parsed = validateManualAmount(body.kind, body.amount, body.reason)
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

    // Un dublu-click pe „Scoate salariul" nu scoate de două ori
    const duplicate = await prisma.salaryEntry.findFirst({
      where: {
        teacherId: body.teacherId,
        kind: body.kind,
        amount: parsed.amount,
        deleted: false,
        createdAt: { gte: new Date(Date.now() - 30 * 1000) },
      },
    })
    if (duplicate) {
      return NextResponse.json({ error: 'Aceeași sumă tocmai a fost înregistrată' }, { status: 409 })
    }

    const entry = await addManualEntry({
      teacherId: body.teacherId,
      kind: body.kind,
      amount: parsed.amount,
      reason: parsed.reason,
      actor: me.actor,
    })
    return NextResponse.json({ entry, balance: await getBalance(body.teacherId) }, { status: 201 })
  } catch (error) {
    console.error('Eroare la adăugarea sumei:', error)
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 })
  }
}
