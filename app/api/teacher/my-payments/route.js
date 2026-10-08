import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyTeacherActivity } from '@/lib/telegram'
import { periodLabel } from '@/lib/payments'

// GET - Fetch payments created by this teacher
export async function GET(request) {
  const session = await getServerSession(authOptions)
  
  if (!session || !['TEACHER', 'ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payments = await prisma.payment.findMany({
      where: { createdById: session.user.id },
      include: {
        groupStudent: {
          include: {
            student: true,
            group: {
              include: {
              }
            }
          }
        }
      },
      orderBy: { paymentDate: 'desc' }
    })

    return NextResponse.json({ payments })
  } catch (error) {
    console.error('Error fetching payments:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST - Create a new payment
export async function POST(request) {
  const session = await getServerSession(authOptions)
  
  if (!session || !['TEACHER', 'ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { groupStudentId, amount, paymentMethod, notes, forYear, forMonth, lessonsAdded, debt } = body

    if (!groupStudentId) {
      return NextResponse.json({ error: 'Selectează o grupă' }, { status: 400 })
    }
    if (!amount || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: 'Introdu o sumă validă' }, { status: 400 })
    }

    // Verify groupStudent exists and teacher has access
    const groupStudent = await prisma.groupStudent.findUnique({
      where: { id: groupStudentId },
      include: {
        group: true,
        student: true
      }
    })

    if (!groupStudent) {
      return NextResponse.json({ error: 'Elevul din grupă nu a fost găsit' }, { status: 404 })
    }

    // Check if teacher has access (is the teacher of the group or created the student)
    const hasAccess = groupStudent.group.teacherId === session.user.id ||
      groupStudent.student.createdById === session.user.id ||
      ['SUPERADMIN', 'ADMIN'].includes(session.user.role)

    if (!hasAccess) {
      return NextResponse.json({ error: 'Nu ai acces la acest elev' }, { status: 403 })
    }

    // Create payment and update lessons in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create payment
      const payment = await tx.payment.create({
        data: {
          groupStudentId,
          amount: parseFloat(amount),
          forYear: forYear ? parseInt(forYear, 10) : null,
          forMonth: forMonth ? parseInt(forMonth, 10) : null,
          paymentMethod: paymentMethod || null,
          notes: notes || null,
          lessonsAdded: lessonsAdded ? parseInt(lessonsAdded, 10) : null,
          debt: debt === '' || debt === undefined || debt === null ? null : parseFloat(debt),
          createdById: session.user.id
        },
        include: {
          groupStudent: {
            include: {
              student: true,
              group: {
                include: {
                }
              }
            }
          }
        }
      })

      if (lessonsAdded && parseInt(lessonsAdded, 10) > 0) {
        await tx.groupStudent.update({
          where: { id: groupStudentId },
          data: { lessonsRemaining: { increment: parseInt(lessonsAdded, 10) } },
        })
      }

      return payment
    })

    // Send Telegram notification - Thread 9
    const details = `👤 Elev: <b>${result.groupStudent.student.fullName}</b>
📚 Grupa: ${result.groupStudent.group.name}
📘 Nivel: ${result.groupStudent.group.level || 'N/A'}
💵 Sumă: <b>${amount} MDL</b>${debt && parseFloat(debt) > 0 ? `
🔴 Datorie rămasă: <b>${debt} MDL</b>` : ''}
🗓 Pentru luna: <b>${periodLabel({ forYear, forMonth, paymentDate: new Date() })}</b>
💳 Metodă: ${paymentMethod || 'Nespecificată'}`

    notifyTeacherActivity('payment', session.user.name || session.user.email, details)
      .catch(err => console.error('Telegram notification error:', err))

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error creating payment:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
