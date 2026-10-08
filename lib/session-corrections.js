import prisma from '@/lib/prisma'

/**
 * Corectarea unei lecții deja înregistrate — folosită atât de admin cât și
 * de profesor, ca regulile de contabilitate să fie exact aceleași oriunde
 * se face corectura.
 *
 * Partea delicată nu e formularul, ci cifrele: dacă lecția a fost procesată
 * („orele deduse"), fiecare prezență schimbată trebuie să întoarcă și
 * pachetul elevului (la grupele individuale) și numărul de absențe. Altfel
 * corectarea ar arăta bine pe ecran și ar minți în rapoarte și în PDF-uri,
 * care citesc direct aceleași cifre din baza de date.
 */

export const sessionInclude = {
  group: {
    include: {
      teacher: { select: { id: true, name: true } },
      groupStudents: { where: { status: { notIn: ['LEFT', 'TRANSFERRED'] } } },
    },
  },
  attendances: { include: { student: { select: { id: true, fullName: true } } } },
}

export async function loadSessionWithAccounting(id) {
  return prisma.lessonSession.findUnique({ where: { id }, include: sessionInclude })
}

/** Ce se întâmplă cu pachetul și absențele când o prezență se schimbă. */
export async function applyAttendanceChange(lessonSession, attendance, nextStatus) {
  const groupStudent = lessonSession.group.groupStudents.find(
    (gs) => gs.studentId === attendance.studentId
  )
  const individual = lessonSession.group.billingType === 'INDIVIDUAL'

  if (nextStatus === attendance.status) return

  if (attendance.status === 'PRESENT' && nextStatus === 'ABSENT') {
    if (groupStudent) {
      await prisma.groupStudent.update({
        where: { id: groupStudent.id },
        data: {
          ...(individual ? { lessonsRemaining: { increment: 1 } } : {}),
          absences: { increment: 1 },
        },
      })
    }
    // Scăderea de atunci nu mai are obiect
    await prisma.lessonTransaction.deleteMany({
      where: { sessionId: lessonSession.id, studentId: attendance.studentId, delta: -1 },
    })
  } else if (attendance.status === 'ABSENT' && nextStatus === 'PRESENT') {
    if (groupStudent) {
      await prisma.groupStudent.update({
        where: { id: groupStudent.id },
        data: {
          ...(individual ? { lessonsRemaining: { decrement: 1 } } : {}),
          absences: { decrement: Math.min(1, groupStudent.absences || 0) },
        },
      })
    }
    await prisma.lessonTransaction.create({
      data: {
        studentId: attendance.studentId,
        groupId: lessonSession.groupId,
        sessionId: lessonSession.id,
        delta: -1,
        reason: `Lecție prezent (corectat) - ${new Date(lessonSession.date).toLocaleDateString('ro-RO')}`,
      },
    })
  }
}

/**
 * Desface complet o sesiune procesată, înainte de ștergere: orele se întorc
 * în pachete (la grupele individuale), absențele se scad.
 */
export async function reverseSessionAccounting(lessonSession) {
  if (!lessonSession.lessonsDeducted) return

  const individual = lessonSession.group.billingType === 'INDIVIDUAL'
  for (const attendance of lessonSession.attendances) {
    const groupStudent = lessonSession.group.groupStudents.find(
      (gs) => gs.studentId === attendance.studentId
    )
    if (!groupStudent) continue

    if (attendance.status === 'PRESENT' && individual) {
      await prisma.groupStudent.update({
        where: { id: groupStudent.id },
        data: { lessonsRemaining: { increment: 1 } },
      })
    } else if (attendance.status === 'ABSENT') {
      await prisma.groupStudent.update({
        where: { id: groupStudent.id },
        data: { absences: { decrement: Math.min(1, groupStudent.absences || 0) } },
      })
    }
  }
  await prisma.lessonTransaction.deleteMany({ where: { sessionId: lessonSession.id } })
}
