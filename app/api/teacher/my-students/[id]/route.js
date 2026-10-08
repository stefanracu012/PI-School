import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { guardTeacherAction } from '@/lib/teacher-actions'
import { syncLeadForStudent } from '@/lib/student-leads'

/**
 * Corectarea unui elev de către profesorul care l-a adăugat.
 *
 * Doar elevii introduși de el și doar în fereastra permisă. Ștergerea merge
 * numai cât timp elevul n-a apucat să aibă istoric: plăți sau prezențe.
 */

export const dynamic = 'force-dynamic'

async function loadOwnStudent(id) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { error: NextResponse.json({ error: 'Neautentificat' }, { status: 401 }) }

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      groupStudents: {
        select: {
          id: true,
          group: { select: { teacherId: true } },
          _count: { select: { payments: true } },
        },
      },
    },
  })

  if (!student) {
    return { error: NextResponse.json({ error: 'Elevul nu există' }, { status: 404 }) }
  }

  const isStaff = ['SUPERADMIN', 'ADMIN'].includes(session.user.role)
  const isMine = student.createdById === session.user.id

  if (!isStaff && !isMine) {
    return {
      error: NextResponse.json(
        { error: 'Poți schimba doar elevii pe care i-ai adăugat tu' },
        { status: 403 }
      ),
    }
  }

  return { student, session }
}

export async function PATCH(request, { params }) {
  const { id } = await params
  const { student, error } = await loadOwnStudent(id)
  if (error) return error

  const denied = await guardTeacherAction(NextResponse, 'teacher.student.edit', student.createdAt)
  if (denied) return denied

  try {
    const body = await request.json()
    const data = {}

    const text = ['fullName', 'parentName', 'parentPhone', 'parentEmail', 'notes', 'level']
    for (const f of text) {
      if (body[f] !== undefined) data[f] = body[f]?.trim() || null
    }
    if (body.age !== undefined) data.age = body.age ? parseInt(body.age, 10) : null
    if (body.isAdult !== undefined) data.isAdult = !!body.isAdult
    if (body.lessonType !== undefined) data.lessonType = body.lessonType || null
    if (body.locationType !== undefined) data.locationType = body.locationType || null
    if (body.startYear !== undefined) data.startYear = body.startYear ?? null
    if (body.startMonth !== undefined) data.startMonth = body.startMonth ?? null

    if (data.fullName === null) {
      return NextResponse.json({ error: 'Numele nu poate fi gol' }, { status: 400 })
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nimic de schimbat' }, { status: 400 })
    }

    const updated = await prisma.student.update({ where: { id }, data })
    syncLeadForStudent(id).catch(() => {})

    return NextResponse.json(updated)
  } catch (e) {
    console.error('Eroare la editarea elevului:', e)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params
  const { student, error } = await loadOwnStudent(id)
  if (error) return error

  const denied = await guardTeacherAction(NextResponse, 'teacher.student.delete', student.createdAt)
  if (denied) return denied

  // Un elev cu plăți sau prezențe nu se șterge dintr-un clic: acolo sunt bani
  // și istoric. Rămâne pe mâna administrației.
  const payments = student.groupStudents.reduce((n, gs) => n + (gs._count?.payments || 0), 0)
  if (payments > 0) {
    return NextResponse.json(
      { error: 'Elevul are plăți înregistrate. Ștergerea o poate face doar administrația.' },
      { status: 409 }
    )
  }

  const attendances = await prisma.attendance.count({ where: { studentId: id } })
  if (attendances > 0) {
    return NextResponse.json(
      { error: 'Elevul are prezențe marcate. Ștergerea o poate face doar administrația.' },
      { status: 409 }
    )
  }

  try {
    await prisma.groupStudent.deleteMany({ where: { studentId: id } })
    await prisma.lead.updateMany({
      where: { convertedStudentId: id },
      data: { convertedStudentId: null },
    })
    await prisma.student.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Eroare la ștergerea elevului:', e)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}
