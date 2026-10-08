import { NextResponse } from 'next/server'
import { syncLeadForStudent } from '@/lib/student-leads'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyTeacherActivity } from '@/lib/telegram'

// POST - Add student to teacher's group
export async function POST(request, { params }) {
  const session = await getServerSession(authOptions)

  if (!session || !['TEACHER', 'ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { groupId } = await params
    const body = await request.json()
    const { studentId } = body

    if (!studentId) {
      return NextResponse.json({ error: 'Student ID is required' }, { status: 400 })
    }

    // Verify group belongs to this teacher
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    })

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    if (group.teacherId !== session.user.id && !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Nu ai acces la această grupă' }, { status: 403 })
    }

    // Verify student exists and belongs to this teacher
    const student = await prisma.student.findUnique({
      where: { id: studentId }
    })

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    // Check if teacher has access to this student (created by them or in their groups)
    const hasAccess = student.createdById === session.user.id ||
      await prisma.groupStudent.findFirst({
        where: {
          studentId: studentId,
          group: { teacherId: session.user.id }
        }
      })

    if (!hasAccess && !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Nu ai acces la acest elev' }, { status: 403 })
    }

    // Check if already in group
    const existing = await prisma.groupStudent.findUnique({
      where: {
        groupId_studentId: {
          groupId,
          studentId
        }
      }
    })

    if (existing) {
      return NextResponse.json({ error: 'Elevul este deja în această grupă' }, { status: 400 })
    }

    // Add student to group with 0 lessons
    const groupStudent = await prisma.groupStudent.create({
      data: {
        groupId,
        studentId,
        lessonsRemaining: 0,
        absences: 0,
        status: 'ACTIVE'
      },
      include: {
        student: true,
        group: {
          include: {
          }
        }
      }
    })

    // Notificare Telegram - Thread Activități Profesori
    const details = `👤 Elev: <b>${groupStudent.student.fullName}</b>
📚 Grupa: ${groupStudent.group.name}
📘 Nivel: ${groupStudent.group.level || 'N/A'}
➕ Adăugat în grupă`
    notifyTeacherActivity('student_group', session.user.name || session.user.email, details)
      .catch(err => console.error('Telegram notification error:', err))

    // Elevul își are lead-ul lui; statusul urmează grupele (Studiază / Waitlist)
    syncLeadForStudent(groupStudent.studentId).catch(() => {})

    return NextResponse.json(groupStudent, { status: 201 })
  } catch (error) {
    console.error('Error adding student to group:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Remove student from teacher's group
export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions)

  if (!session || !['TEACHER', 'ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { groupId } = await params
    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId')

    if (!studentId) {
      return NextResponse.json({ error: 'Student ID is required' }, { status: 400 })
    }

    // Verify group belongs to this teacher
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    })

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    if (group.teacherId !== session.user.id && !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Nu ai acces la această grupă' }, { status: 403 })
    }

    // Find the groupStudent record
    const groupStudent = await prisma.groupStudent.findUnique({
      where: {
        groupId_studentId: {
          groupId,
          studentId
        }
      }
    })

    if (!groupStudent) {
      return NextResponse.json({ error: 'Elevul nu este în această grupă' }, { status: 404 })
    }

    // Delete the association
    await prisma.groupStudent.delete({
      where: { id: groupStudent.id }
    })

    // Elevul își are lead-ul lui; statusul urmează grupele (Studiază / Waitlist)
    syncLeadForStudent(studentId).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing student from group:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
