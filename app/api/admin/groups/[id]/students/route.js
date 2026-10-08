import { NextResponse } from 'next/server'
import { syncLeadForStudent } from '@/lib/student-leads'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { checkPermission } from '@/lib/permissions'
import { notifyTeacherNewStudent } from '@/lib/telegram'

export async function POST(request, { params }) {
  try {
    await requireAdmin()

    const canAdd = await checkPermission('groups.students.add')
    if (!canAdd.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea de a adăuga elevi în grupe' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()

    const { studentId, lessonsRemaining } = body

    // Check if already assigned
    const existing = await prisma.groupStudent.findUnique({
      where: { groupId_studentId: { groupId: id, studentId } }
    })

    if (existing) {
      return NextResponse.json({ error: 'Elevul este deja în această grupă' }, { status: 400 })
    }

    // Get group details with teacher for notification
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        teacher: { select: { telegramChatId: true } },
        branch: { select: { name: true } }
      }
    })

    // Get student details with contact info
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { fullName: true, parentPhone: true, parentEmail: true }
    })

    const groupStudent = await prisma.groupStudent.create({
      data: {
        groupId: id,
        studentId,
        lessonsRemaining: lessonsRemaining || 0
      }
    })

    // Notify teacher via Telegram
    if (group?.teacher?.telegramChatId && student) {
      // Format schedule for display
      const scheduleDays = group.scheduleDays?.join(', ') || ''
      let scheduleTime = group.scheduleTime || ''
      // Parse JSON schedule if needed
      if (scheduleTime.startsWith('{')) {
        try {
          const times = JSON.parse(scheduleTime)
          scheduleTime = Object.entries(times).map(([day, time]) => `${day} ${time}`).join(', ')
        } catch {}
      }

      await notifyTeacherNewStudent({
        teacherChatId: group.teacher.telegramChatId,
        studentName: student.fullName,
        groupName: group.name,
        levelName: group.level || 'Fără nivel',
        scheduleDays,
        scheduleTime,
        branchName: group.branch?.name,
        parentPhone: student.parentPhone,
        parentEmail: student.parentEmail,
        action: 'adăugat'
      })
    }

    // Elevul își are lead-ul lui; statusul urmează grupele (Studiază / Waitlist)
    syncLeadForStudent(groupStudent.studentId).catch(() => {})

    return NextResponse.json(groupStudent, { status: 201 })
  } catch (error) {
    console.error('Error adding student to group:', error)
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to add student to group' }, { status: 500 })
  }
}
