import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { require2FAToken } from '@/lib/security/action-tokens'
import { checkPermission } from '@/lib/permissions'

// GET all payments with filters
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Check permission
    const permCheck = await checkPermission('payments.view')
    if (!permCheck.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea să vezi plățile' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') // format: "2024-01"
    const groupId = searchParams.get('groupId')
    const studentId = searchParams.get('studentId')

    const where = {}

    // Filter by month
    if (month) {
      const [year, monthNum] = month.split('-').map(Number)
      const startDate = new Date(year, monthNum - 1, 1)
      const endDate = new Date(year, monthNum, 0, 23, 59, 59)
      where.paymentDate = {
        gte: startDate,
        lte: endDate
      }
    }

    // Filter by group
    if (groupId) {
      where.groupStudent = {
        groupId
      }
    }

    // Filter by student
    if (studentId) {
      where.groupStudent = {
        ...where.groupStudent,
        studentId
      }
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        groupStudent: {
          include: {
            student: true,
            group: {
              include: {}
            }
          }
        }
      },
      orderBy: { paymentDate: 'desc' }
    })

    // Calculate statistics
    const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0)
    const totalPayments = payments.length
    const uniqueStudents = new Set(
      payments.map(p => p.groupStudent?.studentId).filter(Boolean)
    ).size

    return NextResponse.json({
      payments,
      stats: {
        totalAmount,
        totalPayments,
        uniqueStudents
      }
    })
  } catch (error) {
    console.error('GET payments error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST create new payment
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Check permission - use groups.students.payments.create for adding payments to students in groups
    const permCheck = await checkPermission('groups.students.payments.create')
    if (!permCheck.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea să adaugi plăți' }, { status: 403 })
    }

    const data = await request.json()
    const { groupStudentId, amount, paymentDate, paymentMethod, notes, lessonsAdded, forYear, forMonth, debt } = data

    // 2FA is not required for adding payments - only for sensitive actions

    if (!groupStudentId || amount === undefined) {
      return NextResponse.json({ error: 'groupStudentId și amount sunt obligatorii' }, { status: 400 })
    }

    // Create payment
    const payment = await prisma.payment.create({
      data: {
        groupStudentId,
        amount: parseFloat(amount),
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        forYear: forYear ? parseInt(forYear, 10) : null,
        forMonth: forMonth ? parseInt(forMonth, 10) : null,
        paymentMethod,
        notes,
        lessonsAdded: lessonsAdded ? parseInt(lessonsAdded) : null,
        debt: debt === '' || debt === undefined || debt === null ? null : parseFloat(debt)
      },
      include: {
        groupStudent: {
          include: {
            student: true
          }
        }
      }
    })

    // If lessons were added with this payment, update the groupStudent
    if (lessonsAdded && lessonsAdded > 0) {
      await prisma.groupStudent.update({
        where: { id: groupStudentId },
        data: {
          lessonsRemaining: {
            increment: parseInt(lessonsAdded)
          }
        }
      })
    }

    return NextResponse.json(payment, { status: 201 })
  } catch (error) {
    console.error('POST payment error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
