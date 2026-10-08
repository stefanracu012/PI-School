import { NextResponse } from 'next/server'
import { syncLeadForStudent } from '@/lib/student-leads'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyTeacherActivity } from '@/lib/telegram'

// GET - Fetch students that belong to this teacher (created by them or assigned to their groups)
export async function GET(request) {
  const session = await getServerSession(authOptions)

  if (!session || !['TEACHER', 'ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get students that:
    // 1. Were created by this teacher
    // 2. Are in any of this teacher's groups
    const [createdStudents, groupStudents] = await Promise.all([
      // Students created by this teacher
      prisma.student.findMany({
        where: { createdById: session.user.id },
        include: {
          groupStudents: {
            include: {
              group: {
                include: {
                  teacher: { select: { id: true, name: true } }
                }
              },
              payments: {
                where: { createdById: session.user.id },
                orderBy: { paymentDate: 'desc' }
              }
            }
          }
        },
        orderBy: { fullName: 'asc' }
      }),
      // Students in teacher's groups (assigned by admin)
      prisma.groupStudent.findMany({
        where: {
          group: { teacherId: session.user.id }
        },
        include: {
          student: true,
          group: {
            include: {
              teacher: { select: { id: true, name: true } }
            }
          },
          payments: {
            where: { createdById: session.user.id },
            orderBy: { paymentDate: 'desc' }
          }
        }
      })
    ])

    // Combine and deduplicate students
    const studentsMap = new Map()

    // Add students created by teacher
    for (const student of createdStudents) {
      studentsMap.set(student.id, {
        ...student,
        isCreatedByMe: true,
        groups: student.groupStudents.map(gs => ({
          groupStudentId: gs.id,
          groupId: gs.groupId,
          groupName: gs.group.name,
          levelName: gs.group.level,
          teacherId: gs.group.teacher.id,
          teacherName: gs.group.teacher.name,
          lessonsRemaining: gs.lessonsRemaining,
          absences: gs.absences,
          status: gs.status,
          isMyGroup: gs.group.teacherId === session.user.id,
          myPayments: gs.payments
        }))
      })
    }

    // Add students from teacher's groups (if not already added)
    for (const gs of groupStudents) {
      if (!studentsMap.has(gs.studentId)) {
        studentsMap.set(gs.studentId, {
          ...gs.student,
          isCreatedByMe: false,
          groups: [{
            groupStudentId: gs.id,
            groupId: gs.groupId,
            groupName: gs.group.name,
            levelName: gs.group.level,
            teacherId: gs.group.teacher.id,
            teacherName: gs.group.teacher.name,
            lessonsRemaining: gs.lessonsRemaining,
            absences: gs.absences,
            status: gs.status,
            isMyGroup: true,
            myPayments: gs.payments
          }]
        })
      } else {
        // Student already exists, add this group if it's the teacher's group
        const existing = studentsMap.get(gs.studentId)
        const hasGroup = existing.groups.some(g => g.groupId === gs.groupId)
        if (!hasGroup) {
          existing.groups.push({
            groupStudentId: gs.id,
            groupId: gs.groupId,
            groupName: gs.group.name,
            levelName: gs.group.level,
            teacherId: gs.group.teacher.id,
            teacherName: gs.group.teacher.name,
            lessonsRemaining: gs.lessonsRemaining,
            absences: gs.absences,
            status: gs.status,
            isMyGroup: true,
            myPayments: gs.payments
          })
        }
      }
    }

    const students = Array.from(studentsMap.values())
      .sort((a, b) => a.fullName.localeCompare(b.fullName))

    return NextResponse.json({ students })
  } catch (error) {
    console.error('Error fetching teacher students:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST - Create a new student (teacher can create students)
export async function POST(request) {
  const session = await getServerSession(authOptions)

  if (!session || !['TEACHER', 'ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { fullName, age, parentName, parentPhone, parentEmail, notes, groupId,
      level, startYear, startMonth } = body

    if (!fullName || !fullName.trim()) {
      return NextResponse.json({ error: 'Numele elevului este obligatoriu' }, { status: 400 })
    }

    // Create student with createdById set to current teacher
    const student = await prisma.student.create({
      data: {
        fullName: fullName.trim(),
        age: age ? parseInt(age) : null,
        parentName: parentName?.trim() || null,
        parentPhone: parentPhone?.trim() || null,
        parentEmail: parentEmail?.trim() || null,
        notes: notes?.trim() || null,
        level: level || null,
        startYear: startYear ?? null,
        startMonth: startMonth ?? null,
        createdById: session.user.id
      }
    })

    // If groupId is provided and it's the teacher's group, add student to group with 0 lessons
    if (groupId) {
      // Verify group belongs to this teacher
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true, teacherId: true, name: true }
      })

      if (group && group.teacherId === session.user.id) {
        await prisma.groupStudent.create({
          data: {
            groupId: groupId,
            studentId: student.id,
            lessonsRemaining: 0, // Start with 0 lessons
            absences: 0,
            status: 'ACTIVE'
          }
        })
      }
    }

    // Send Telegram notification - Thread 9
    let details = `👤 Elev: <b>${student.fullName}</b>`
    if (student.age) details += `\n🎂 Vârstă: ${student.age} ani`
    if (student.level) details += `\n📘 Nivel: ${student.level}`
    if (student.startYear && student.startMonth) {
      const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
        'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
      details += `\n🗓 Începe: ${MONTHS[student.startMonth - 1]} ${student.startYear}`
    }
    if (student.parentName) details += `\n👨‍👩‍👧 Părinte: ${student.parentName}`
    if (student.parentPhone) details += `\n📱 Telefon: ${student.parentPhone}`

    notifyTeacherActivity('student', session.user.name || session.user.email, details)
      .catch(err => console.error('Telegram notification error:', err))

    // Elevul își are lead-ul lui; statusul urmează grupele (Studiază / Waitlist)
    syncLeadForStudent(student.id).catch(() => {})

    return NextResponse.json(student, { status: 201 })
  } catch (error) {
    console.error('Error creating student:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
