import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { guardTeacherAction } from '@/lib/teacher-actions'

/**
 * Corectarea unei plăți de către profesorul care a înregistrat-o.
 *
 * Doar plățile lui și doar în fereastra permisă (24h, sau oricând cu dreptul
 * „fără limită"). Administrația nu trece pe aici — are rutele ei.
 */

export const dynamic = 'force-dynamic'

async function loadOwnPayment(id) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { error: NextResponse.json({ error: 'Neautentificat' }, { status: 401 }) }

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      groupStudent: {
        select: {
          id: true,
          lessonsRemaining: true,
          group: { select: { teacherId: true } },
        },
      },
    },
  })

  if (!payment) {
    return { error: NextResponse.json({ error: 'Plata nu există' }, { status: 404 }) }
  }

  const isStaff = ['SUPERADMIN', 'ADMIN'].includes(session.user.role)
  const isMine = payment.createdById === session.user.id
  const myGroup = payment.groupStudent?.group?.teacherId === session.user.id

  if (!isStaff && !isMine && !myGroup) {
    return { error: NextResponse.json({ error: 'Nu ai acces la această plată' }, { status: 403 }) }
  }

  return { payment, session }
}

export async function PATCH(request, { params }) {
  const { id } = await params
  const { payment, error } = await loadOwnPayment(id)
  if (error) return error

  const denied = await guardTeacherAction(NextResponse, 'teacher.payment.edit', payment.createdAt)
  if (denied) return denied

  try {
    const body = await request.json()
    const data = {}

    if (body.amount !== undefined) data.amount = parseFloat(body.amount)
    if (body.debt !== undefined) data.debt = body.debt === '' || body.debt === null ? null : parseFloat(body.debt)
    if (body.paymentMethod !== undefined) data.paymentMethod = body.paymentMethod || null
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null
    if (body.forYear !== undefined) data.forYear = body.forYear ? parseInt(body.forYear, 10) : null
    if (body.forMonth !== undefined) data.forMonth = body.forMonth ? parseInt(body.forMonth, 10) : null

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nimic de schimbat' }, { status: 400 })
    }

    const updated = await prisma.payment.update({ where: { id }, data })
    return NextResponse.json(updated)
  } catch (e) {
    console.error('Eroare la editarea plății:', e)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params
  const { payment, error } = await loadOwnPayment(id)
  if (error) return error

  const denied = await guardTeacherAction(NextResponse, 'teacher.payment.delete', payment.createdAt)
  if (denied) return denied

  try {
    // Plata adăugase lecții? Le luăm înapoi, altfel elevul rămâne cu ore plătite
    // de o plată care nu mai există.
    if (payment.lessonsAdded > 0 && payment.groupStudentId) {
      await prisma.groupStudent.update({
        where: { id: payment.groupStudentId },
        data: { lessonsRemaining: { decrement: payment.lessonsAdded } },
      }).catch(() => {})
    }

    await prisma.payment.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Eroare la ștergerea plății:', e)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}
