import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/permissions'
import { removeSourceSalary } from '@/lib/salary'

// GET - Fetch specific makeup lesson details
export async function GET(request, { params }) {
  const session = await getServerSession(authOptions)
  
  if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Check permission
  const permCheck = await checkPermission('makeup.view')
  if (!permCheck.allowed) {
    return NextResponse.json({ error: 'Nu ai permisiunea să vezi recuperările' }, { status: 403 })
  }

  try {
    const { id } = await params

    const makeupLesson = await prisma.makeupLesson.findUnique({
      where: { id },
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        group: {
          include: {
            groupStudents: {
              include: {
                student: true
              }
            }
          }
        },
        branch: {
          select: {
            id: true,
            name: true
          }
        },
        students: {
          include: {
            student: true
          }
        }
      }
    })

    if (!makeupLesson) {
      return NextResponse.json({ error: 'Makeup lesson not found' }, { status: 404 })
    }

    return NextResponse.json(makeupLesson)
  } catch (error) {
    console.error('Error fetching makeup lesson:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH - Update a makeup lesson
export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions)
  
  if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Check permission
  const permCheck = await checkPermission('makeup.edit')
  if (!permCheck.allowed) {
    return NextResponse.json({ error: 'Nu ai permisiunea să editezi recuperări' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { groupId, teacherId, branchId, locationDetails, scheduledAt, notes, studentIds, status } = body

    const existingLesson = await prisma.makeupLesson.findUnique({
      where: { id },
      include: {
        students: true
      }
    })

    if (!existingLesson) {
      return NextResponse.json({ error: 'Makeup lesson not found' }, { status: 404 })
    }

    // Build update data
    const updateData = {}
    
    if (groupId !== undefined) updateData.groupId = groupId
    if (teacherId !== undefined) updateData.teacherId = teacherId
    if (branchId !== undefined) updateData.branchId = branchId || null
    if (locationDetails !== undefined) updateData.locationDetails = locationDetails || null
    if (notes !== undefined) updateData.notes = notes || null
    if (status !== undefined) updateData.status = status

    // Handle scheduledAt conversion
    if (scheduledAt !== undefined) {
      // Store the time exactly as the user entered it (no timezone conversion)
      // We append 'Z' to make JavaScript interpret it as UTC
      updateData.scheduledAt = new Date(scheduledAt + 'Z')
    }

    // Update makeup lesson
    const makeupLesson = await prisma.makeupLesson.update({
      where: { id },
      data: updateData,
      include: {
        teacher: {
          select: { id: true, name: true, email: true }
        },
        group: {
          include: {}
        },
        branch: {
          select: { id: true, name: true }
        },
        students: {
          include: { student: true }
        }
      }
    })

    // Handle students update if provided
    if (studentIds !== undefined) {
      // Get existing student IDs
      const existingStudentIds = existingLesson.students.map(s => s.studentId)
      
      // Students to add
      const toAdd = studentIds.filter(id => !existingStudentIds.includes(id))
      // Students to remove
      const toRemove = existingStudentIds.filter(id => !studentIds.includes(id))
      
      // Remove students
      if (toRemove.length > 0) {
        await prisma.makeupLessonStudent.deleteMany({
          where: {
            makeupLessonId: id,
            studentId: { in: toRemove }
          }
        })
      }
      
      // Add students
      if (toAdd.length > 0) {
        await prisma.makeupLessonStudent.createMany({
          data: toAdd.map(studentId => ({
            makeupLessonId: id,
            studentId,
            status: 'PENDING'
          }))
        })
      }
      
      // Refetch with updated students
      const updatedLesson = await prisma.makeupLesson.findUnique({
        where: { id },
        include: {
          teacher: {
            select: { id: true, name: true, email: true }
          },
          group: {
            include: {}
          },
          branch: {
            select: { id: true, name: true }
          },
          students: {
            include: { student: true }
          }
        }
      })
      
      return NextResponse.json(updatedLesson)
    }

    return NextResponse.json(makeupLesson)
  } catch (error) {
    console.error('Error updating makeup lesson:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Delete a makeup lesson (admin only)
export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions)
  
  if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Check permission
  const permCheck = await checkPermission('makeup.delete')
  if (!permCheck.allowed) {
    return NextResponse.json({ error: 'Nu ai permisiunea să ștergi recuperări' }, { status: 403 })
  }

  try {
    const { id } = await params

    const makeupLesson = await prisma.makeupLesson.findUnique({
      where: { id }
    })

    if (!makeupLesson) {
      return NextResponse.json({ error: 'Makeup lesson not found' }, { status: 404 })
    }

    // O recuperare ținută și ștearsă apoi iese și din salariu
    await removeSourceSalary({ makeupId: id }, session.user.name)

    // Delete all students first
    await prisma.makeupLessonStudent.deleteMany({
      where: { makeupLessonId: id }
    })

    await prisma.makeupLesson.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting makeup lesson:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
