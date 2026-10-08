import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// GET payments statistics by month
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year')) || new Date().getFullYear()

    // Get all payments for the year
    const startDate = new Date(year, 0, 1)
    const endDate = new Date(year, 11, 31, 23, 59, 59)

    const [payments, learningPayments] = await Promise.all([
      prisma.payment.findMany({
        where: { paymentDate: { gte: startDate, lte: endDate } },
        include: {
          groupStudent: {
            include: {
              student: true,
              group: { include: { branch: true, teacher: true } }
            }
          },
          createdBy: { select: { id: true, name: true, role: true } }
        },
        orderBy: { paymentDate: 'desc' }
      }),
      prisma.learningPayment.findMany({
        where: { paymentDate: { gte: startDate, lte: endDate } },
        include: {
          student: { select: { id: true, fullName: true } }
        },
        orderBy: { paymentDate: 'desc' }
      })
    ])

    // Get all branches for filter
    const branches = await prisma.branch.findMany({
      orderBy: { name: 'asc' }
    })

    // Get all teachers for filter (users with TEACHER role or who have created payments)
    const teachers = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'TEACHER' },
          { id: { in: payments.map(p => p.createdById).filter(Boolean) } }
        ]
      },
      select: {
        id: true,
        name: true,
        role: true
      },
      orderBy: { name: 'asc' }
    })

    // Group by month
    const monthlyStats = {}
    const months = [
      'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
      'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
    ]

    // Initialize all months
    for (let i = 0; i < 12; i++) {
      monthlyStats[i] = {
        month: months[i],
        monthNumber: i + 1,
        totalAmount: 0,
        totalDebt: 0,
        totalPayments: 0,
        uniqueStudents: new Set(),
        payments: []
      }
    }

    // Populate with actual data — plăți de grupă
    payments.forEach(payment => {
      const month = new Date(payment.paymentDate).getMonth()
      const gs = payment.groupStudent
      monthlyStats[month].totalAmount += payment.amount
      monthlyStats[month].totalDebt += payment.debt || 0
      monthlyStats[month].totalPayments += 1
      if (gs?.studentId) monthlyStats[month].uniqueStudents.add(gs.studentId)
      monthlyStats[month].payments.push({
        id: payment.id,
        source: 'cursuri',
        amount: payment.amount,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        notes: payment.notes,
        lessonsAdded: payment.lessonsAdded,
        debt: payment.debt || 0,
        studentId: gs?.studentId || null,
        studentName: gs?.student?.fullName || payment.studentNameSnapshot || 'Elev șters',
        groupName: gs?.group?.name || payment.groupNameSnapshot || 'Grupă ștearsă',
        levelName: gs?.group?.level || payment.levelSnapshot || null,
        branchId: gs?.group?.branchId || null,
        branchName: gs?.group?.branch?.name || 'Fără filială',
        teacherId: gs?.group?.teacherId || null,
        teacherName: gs?.group?.teacher?.name || 'Neassignat',
        createdById: payment.createdById || 'unknown',
        createdByName: payment.createdBy?.name || 'Administratori',
        createdByRole: payment.createdBy?.role || 'UNKNOWN',
        isDetached: !gs,
      })
    })

    // Populate with learning app payments
    learningPayments.forEach(lp => {
      const month = new Date(lp.paymentDate).getMonth()
      monthlyStats[month].totalAmount += lp.amount
      monthlyStats[month].totalPayments += 1
      monthlyStats[month].uniqueStudents.add(lp.studentId)
      monthlyStats[month].payments.push({
        id: lp.id,
        source: 'app',
        amount: lp.amount,
        paymentDate: lp.paymentDate,
        paymentMethod: 'app',
        notes: lp.notes,
        lessonsAdded: null,
        validDays: lp.validDays,
        expiresAt: lp.expiresAt,
        studentId: lp.studentId,
        studentName: lp.student?.fullName || 'Elev șters',
        groupName: `Aplicație /learn • ${lp.validDays} zile`,
        levelName: 'Aplicație /learn',
        branchId: null,
        branchName: 'Aplicație',
        teacherId: null,
        teacherName: '-',
        createdById: lp.createdById || 'unknown',
        createdByName: 'Aplicație',
        createdByRole: 'APP',
        isDetached: false,
      })
    })

    // Convert Sets to counts
    const result = Object.values(monthlyStats).map(stat => ({
      ...stat,
      uniqueStudents: stat.uniqueStudents.size
    }))

    // Calculate year totals
    const yearTotal = {
      totalAmount: [...payments, ...learningPayments].reduce((sum, p) => sum + p.amount, 0),
      totalDebt: payments.reduce((sum, p) => sum + (p.debt || 0), 0),
      totalPayments: payments.length + learningPayments.length,
      uniqueStudents: new Set([
        ...payments.map(p => p.groupStudent?.studentId),
        ...learningPayments.map(p => p.studentId)
      ].filter(Boolean)).size
    }

    // Calculate stats per teacher (who created payments)
    const teacherStats = {}
    payments.forEach(p => {
      const creatorId = p.createdById || 'unknown'
      const creatorName = p.createdBy?.name || 'Administratori'
      if (!teacherStats[creatorId]) {
        teacherStats[creatorId] = {
          id: creatorId,
          name: creatorName,
          totalAmount: 0,
          totalPayments: 0
        }
      }
      teacherStats[creatorId].totalAmount += p.amount
      teacherStats[creatorId].totalPayments += 1
    })

    return NextResponse.json({
      year,
      months: result,
      yearTotal,
      branches,
      teachers,
      teacherStats: Object.values(teacherStats).sort((a, b) => b.totalAmount - a.totalAmount)
    })
  } catch (error) {
    console.error('GET payment stats error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
