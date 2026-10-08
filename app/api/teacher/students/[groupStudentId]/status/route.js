import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH - Update student status in a group
export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions)
  
  if (!session || !['TEACHER', 'ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { groupStudentId } = await params
    const body = await request.json()
    const { status, statusNote } = body

    // Validate status - TRANSFERRED is not allowed for teachers
    const allowedStatuses = ['ACTIVE', 'PAUSED', 'LEFT', 'COMPLETED']
    if (!status || !allowedStatuses.includes(status)) {
      return NextResponse.json({ 
        error: 'Status invalid. Statusurile permise sunt: Activ, Pauză, Plecat, Terminat' 
      }, { status: 400 })
    }

    // Verify groupStudent exists
    const groupStudent = await prisma.groupStudent.findUnique({
      where: { id: groupStudentId },
      include: {
        group: true,
        student: true
      }
    })

    if (!groupStudent) {
      return NextResponse.json({ error: 'Elevul nu a fost găsit' }, { status: 404 })
    }

    // Check if teacher has access (is the teacher of the group or created the student)
    const hasAccess = groupStudent.group.teacherId === session.user.id ||
      groupStudent.student.createdById === session.user.id ||
      ['SUPERADMIN', 'ADMIN'].includes(session.user.role)

    if (!hasAccess) {
      return NextResponse.json({ error: 'Nu ai acces la acest elev' }, { status: 403 })
    }

    // Update status
    const updated = await prisma.groupStudent.update({
      where: { id: groupStudentId },
      data: {
        status,
        statusNote: statusNote || null,
        statusChangedAt: new Date()
      },
      include: {
        student: true,
        group: {
          include: {
          }
        }
      }
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating student status:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
