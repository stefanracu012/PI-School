import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncSessionSalary } from '@/lib/salary'

export async function POST(request) {
  const session = await getServerSession(authOptions)
  
  if (!session || !['TEACHER', 'ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { sessionId } = await request.json()

    // Get the session with all attendances
    const lessonSession = await prisma.lessonSession.findUnique({
      where: { id: sessionId },
      include: {
        group: {
          include: {
            groupStudents: {
              where: {
                status: { notIn: ['LEFT', 'TRANSFERRED'] }  // Only active students
              }
            }
          }
        },
        attendances: true
      }
    })

    if (!lessonSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (lessonSession.group.teacherId !== session.user.id && !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (lessonSession.lessonsDeducted) {
      return NextResponse.json({ error: 'Lessons already deducted' }, { status: 400 })
    }

    // Check all students have attendance marked
    if (lessonSession.attendances.length !== lessonSession.group.groupStudents.length) {
      return NextResponse.json({ 
        error: 'All students must have attendance marked before deducting' 
      }, { status: 400 })
    }

    // Process each attendance
    const transactions = []
    
    for (const attendance of lessonSession.attendances) {
      const groupStudent = lessonSession.group.groupStudents.find(
        gs => gs.studentId === attendance.studentId
      )

      if (!groupStudent) continue

      if (attendance.status === 'PRESENT') {
        // La grupele plătite individual, prezența consumă o lecție din pachetul
        // elevului. La cele lunare, socoteala e a grupei — nu se scade nimic.
        if (lessonSession.group.billingType === 'INDIVIDUAL') {
          await prisma.groupStudent.update({
            where: { id: groupStudent.id },
            data: { lessonsRemaining: { decrement: 1 } },
          })
        }

        transactions.push({
          studentId: attendance.studentId,
          groupId: lessonSession.groupId,
          sessionId: lessonSession.id,
          delta: -1,
          reason: `Lecție prezent - ${new Date(lessonSession.date).toLocaleDateString('ro-RO')}`
        })
      } else if (attendance.status === 'ABSENT') {
        // Increment absences for absent students
        await prisma.groupStudent.update({
          where: { id: groupStudent.id },
          data: {
            absences: { increment: 1 }
          }
        })
      }
    }

    // Create all transaction records
    if (transactions.length > 0) {
      await prisma.lessonTransaction.createMany({
        data: transactions
      })
    }

    // Mark session as processed
    await prisma.lessonSession.update({
      where: { id: sessionId },
      data: { lessonsDeducted: true }
    })

    // Lecția ținută intră în salariul profesorului, după regula grupei
    await syncSessionSalary(sessionId)

    // Lecțiile rămase se urmăresc per grupă, în pachetul lunar — nu mai
    // trimitem alerte pentru fiecare elev în parte. Cron-ul zilnic anunță o
    // singură dată pe grupă, când pachetul lunii se apropie de final.

    return NextResponse.json({ success: true, deducted: transactions.length })
  } catch (error) {
    console.error('Error deducting lessons:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
