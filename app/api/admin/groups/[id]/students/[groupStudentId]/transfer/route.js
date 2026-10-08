import { NextResponse } from 'next/server'
import { syncLeadForStudent } from '@/lib/student-leads'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { checkPermission } from '@/lib/permissions'
import { notifyTeacherNewStudent, notifyTeacherStudentRemoved } from '@/lib/telegram'

export async function POST(request, { params }) {
  try {
    await requireAdmin()

    // Check permission
    const permCheck = await checkPermission('groups.students.transfer')
    if (!permCheck.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea să transferi elevi' }, { status: 403 })
    }

    const { id: groupId, groupStudentId } = await params
    const { targetGroupId, transferLessons, transferAbsences } = await request.json()

    if (!targetGroupId) {
      return NextResponse.json({ error: 'Grupa destinație este obligatorie' }, { status: 400 })
    }

    // Verifică că grupă sursă există cu detalii teacher
    const sourceGroup = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        teacher: { select: { telegramChatId: true, name: true } }
      }
    })

    if (!sourceGroup) {
      return NextResponse.json({ error: 'Grupa sursă nu există' }, { status: 404 })
    }

    // Verifică că elevul este în grupa sursă
    const groupStudent = await prisma.groupStudent.findUnique({
      where: { id: groupStudentId },
      include: {
        student: {
          select: { fullName: true, parentPhone: true, parentEmail: true }
        }
      }
    })

    if (!groupStudent || groupStudent.groupId !== groupId) {
      return NextResponse.json({ error: 'Elevul nu este în această grupă' }, { status: 404 })
    }

    // Verifică că grupa destinație există și este activă
    const targetGroup = await prisma.group.findUnique({
      where: { id: targetGroupId },
      include: {
        teacher: { select: { telegramChatId: true, name: true } },
        branch: { select: { name: true } }
      }
    })

    if (!targetGroup) {
      return NextResponse.json({ error: 'Grupa destinație nu există' }, { status: 404 })
    }

    // Verifică dacă elevul este deja ACTIV în grupa destinație
    const existingEnrollment = await prisma.groupStudent.findFirst({
      where: {
        groupId: targetGroupId,
        studentId: groupStudent.studentId,
        status: 'ACTIVE'
      }
    })

    if (existingEnrollment) {
      return NextResponse.json({ error: 'Elevul este deja activ în grupa destinație' }, { status: 400 })
    }

    // Verifică dacă există o înregistrare veche (LEFT/PAUSED) pe care o putem reactiva
    const oldEnrollment = await prisma.groupStudent.findFirst({
      where: {
        groupId: targetGroupId,
        studentId: groupStudent.studentId,
        status: { in: ['LEFT', 'PAUSED', 'COMPLETED', 'TRANSFERRED'] }
      }
    })

    // Efectuăm transferul
    // 1. Marcăm elevul în grupa veche ca "TRANSFERRED"
    await prisma.groupStudent.update({
      where: { id: groupStudentId },
      data: {
        status: 'TRANSFERRED',
        statusNote: `Transferat în ${targetGroup.name} la ${new Date().toLocaleDateString('ro-RO')}`
      }
    })

    let newGroupStudent

    // 2. Dacă există o înregistrare veche, o reactivăm; altfel creăm una nouă
    if (oldEnrollment) {
      newGroupStudent = await prisma.groupStudent.update({
        where: { id: oldEnrollment.id },
        data: {
          lessonsRemaining: transferLessons ? groupStudent.lessonsRemaining : oldEnrollment.lessonsRemaining,
          absences: transferAbsences ? groupStudent.absences : 0,
          status: 'ACTIVE',
          statusNote: `Reactivat/Transferat din ${sourceGroup.name} la ${new Date().toLocaleDateString('ro-RO')}`
        }
      })
    } else {
      newGroupStudent = await prisma.groupStudent.create({
        data: {
          groupId: targetGroupId,
          studentId: groupStudent.studentId,
          lessonsRemaining: transferLessons ? groupStudent.lessonsRemaining : 0,
          absences: transferAbsences ? groupStudent.absences : 0,
          status: 'ACTIVE',
          statusNote: `Transferat din ${sourceGroup.name} la ${new Date().toLocaleDateString('ro-RO')}`
        }
      })
    }

    // Notify source group teacher that student left
    if (sourceGroup.teacher?.telegramChatId) {
      await notifyTeacherStudentRemoved({
        teacherChatId: sourceGroup.teacher.telegramChatId,
        studentName: groupStudent.student.fullName,
        groupName: sourceGroup.name,
        targetGroup: targetGroup.name,
        targetTeacher: targetGroup.teacher?.name,
        isTransfer: true
      })
    }

    // Notify target group teacher that student was added
    if (targetGroup.teacher?.telegramChatId) {
      // Format schedule for display
      const scheduleDays = targetGroup.scheduleDays?.join(', ') || ''
      let scheduleTime = targetGroup.scheduleTime || ''
      if (scheduleTime.startsWith('{')) {
        try {
          const times = JSON.parse(scheduleTime)
          scheduleTime = Object.entries(times).map(([day, time]) => `${day} ${time}`).join(', ')
        } catch {}
      }

      await notifyTeacherNewStudent({
        teacherChatId: targetGroup.teacher.telegramChatId,
        studentName: groupStudent.student.fullName,
        groupName: targetGroup.name,
        levelName: targetGroup.level || 'Fără nivel',
        scheduleDays,
        scheduleTime,
        branchName: targetGroup.branch?.name,
        parentPhone: groupStudent.student.parentPhone,
        parentEmail: groupStudent.student.parentEmail,
        action: 'transferat',
        previousTeacher: sourceGroup.teacher?.name,
        previousGroup: sourceGroup.name
      })
    }

    return NextResponse.json({
      success: true,
      message: `${groupStudent.student.fullName} a fost transferat în ${targetGroup.name}`,
      newGroupStudentId: newGroupStudent.id
    })

  } catch (error) {
    console.error('Error transferring student:', error)
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    // Elevul își are lead-ul lui; statusul urmează grupele (Studiază / Waitlist)
    syncLeadForStudent(groupStudent.studentId).catch(() => {})

    return NextResponse.json({ error: 'Eroare la transferul elevului' }, { status: 500 })
  }
}
