import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPermission } from '@/lib/permissions'

// GET single payment
export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Check permission
    const permCheck = await checkPermission('groups.students.payments.view')
    if (!permCheck.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea să vezi plățile' }, { status: 403 })
    }

    const { id } = await params

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        groupStudent: {
          include: {
            student: true,
            group: {
              include: {}
            }
          }
        }
      }
    })

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    return NextResponse.json(payment)
  } catch (error) {
    console.error('GET payment error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE payment
export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Check permission
    const permCheck = await checkPermission('groups.students.payments.delete')
    if (!permCheck.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea să ștergi plăți' }, { status: 403 })
    }

    const { id } = await params

    // Get payment first to check if lessons were added
    const payment = await prisma.payment.findUnique({
      where: { id }
    })

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    // If lessons were added with this payment, deduct them
    if (payment.lessonsAdded && payment.lessonsAdded > 0) {
      await prisma.groupStudent.update({
        where: { id: payment.groupStudentId },
        data: {
          lessonsRemaining: {
            decrement: payment.lessonsAdded
          }
        }
      })
    }

    await prisma.payment.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE payment error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
