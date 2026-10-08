import { NextResponse } from 'next/server'
import { syncLeadForStudent } from '@/lib/student-leads'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { checkPermission } from '@/lib/permissions'

export async function DELETE(request, { params }) {
  try {
    await requireAdmin()

    // Check permission
    const permCheck = await checkPermission('groups.students.remove')
    if (!permCheck.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea să elimini elevi din grupă' }, { status: 403 })
    }

    const { groupStudentId } = await params

    const removed = await prisma.groupStudent.delete({ where: { id: groupStudentId } })

    // Elevul își are lead-ul lui; statusul urmează grupele (Studiază / Waitlist)
    syncLeadForStudent(removed.studentId).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to remove student from group' }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  try {
    await requireAdmin()
    const { groupStudentId } = await params
    const body = await request.json()
    const { addLessons, addAbsences, status, statusNote } = body

    // Check permissions based on what's being updated
    if (addLessons !== undefined) {
      const permCheck = await checkPermission('groups.students.lessons')
      if (!permCheck.allowed) {
        return NextResponse.json({ error: 'Nu ai permisiunea să modifici lecțiile' }, { status: 403 })
      }
    }

    if (addAbsences !== undefined) {
      const permCheck = await checkPermission('groups.students.absences')
      if (!permCheck.allowed) {
        return NextResponse.json({ error: 'Nu ai permisiunea să modifici absențele' }, { status: 403 })
      }
    }

    if (status !== undefined) {
      const permCheck = await checkPermission('groups.students.status')
      if (!permCheck.allowed) {
        return NextResponse.json({ error: 'Nu ai permisiunea să schimbi statusul elevului' }, { status: 403 })
      }
    }

    // Get current groupStudent
    const groupStudent = await prisma.groupStudent.findUnique({
      where: { id: groupStudentId }
    })

    if (!groupStudent) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    // Build update data
    const updateData = {}

    // Handle lessons update
    if (addLessons !== undefined) {
      const newLessonsRemaining = groupStudent.lessonsRemaining + addLessons
      updateData.lessonsRemaining = newLessonsRemaining
    }

    // Handle absences update
    if (addAbsences !== undefined) {
      const newAbsences = Math.max(0, (groupStudent.absences || 0) + addAbsences)
      updateData.absences = newAbsences
    }

    // Handle status update
    if (status !== undefined) {
      updateData.status = status
      updateData.statusChangedAt = new Date()
      if (statusNote !== undefined) {
        updateData.statusNote = statusNote
      }
    }

    // Update
    const updated = await prisma.groupStudent.update({
      where: { id: groupStudentId },
      data: updateData
    })

    // Elevul își are lead-ul lui; statusul urmează grupele (Studiază / Waitlist)
    syncLeadForStudent(updated.studentId).catch(() => {})

    return NextResponse.json(updated)
  } catch (error) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('Error updating group student:', error)
    return NextResponse.json({ error: 'Failed to update student' }, { status: 500 })
  }
}
