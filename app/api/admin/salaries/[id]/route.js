import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { currentSalaryUser, validateManualAmount, editEntry, deleteEntry, getBalance } from '@/lib/salary'

// PATCH — altă sumă sau alt motiv pentru un rând
export async function PATCH(request, { params }) {
  const me = await currentSalaryUser()
  if (!me) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })
  if (!me.access.edit) return NextResponse.json({ error: 'Nu ai dreptul să editezi salariile' }, { status: 403 })

  try {
    const { id } = await params
    const body = await request.json()
    const current = await prisma.salaryEntry.findUnique({ where: { id } })
    if (!current || current.deleted) {
      return NextResponse.json({ error: 'Rândul nu mai există' }, { status: 404 })
    }

    // Motivul gol înseamnă „păstrează-l" — doar corectarea îl cere obligatoriu
    const reason = String(body.reason ?? '').trim() || current.reason
    const parsed = validateManualAmount(current.kind, body.amount ?? Math.abs(current.amount), reason)
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { entry } = await editEntry(id, { amount: parsed.amount, reason: parsed.reason }, me.actor)
    return NextResponse.json({ entry, balance: await getBalance(entry.teacherId) })
  } catch (error) {
    console.error('Eroare la editarea sumei:', error)
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 })
  }
}

// DELETE — anulează rândul; rămâne în istoric, marcat
export async function DELETE(request, { params }) {
  const me = await currentSalaryUser()
  if (!me) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })
  if (!me.access.delete) return NextResponse.json({ error: 'Nu ai dreptul să anulezi sume' }, { status: 403 })

  try {
    const { id } = await params
    const entry = await deleteEntry(id, me.actor)
    return NextResponse.json({ entry, balance: await getBalance(entry.teacherId) })
  } catch (error) {
    console.error('Eroare la anularea sumei:', error)
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 400 })
  }
}
