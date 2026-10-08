import prisma from '@/lib/prisma'

/**
 * Rezolvarea unei lecții raportate ca neefectuată.
 *
 * Adminul nu are cum să știe dacă ora de ieri chiar s-a ținut — profesorul
 * știe. Ambele variante închid raportul (acknowledged), dar „s-a ținut"
 * creează și sesiunea lipsă, cu toți elevii marcați prezenți implicit.
 */

/** Lecția s-a ținut totuși: creează sesiunea (idempotent) și prezențele. */
export async function markMissedSessionHeld(missed) {
  const dayStart = new Date(missed.scheduledDate); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(missed.scheduledDate); dayEnd.setHours(23, 59, 59, 999)

  const [existingSession, activeStudents] = await Promise.all([
    prisma.lessonSession.findFirst({
      where: { groupId: missed.groupId, date: { gte: dayStart, lte: dayEnd } },
    }),
    prisma.groupStudent.findMany({
      where: { groupId: missed.groupId, status: { notIn: ['LEFT', 'TRANSFERRED'] } },
      select: { studentId: true },
    }),
  ])

  const lessonSession =
    existingSession ||
    (await prisma.lessonSession.create({
      data: { groupId: missed.groupId, date: missed.scheduledDate },
    }))

  if (activeStudents.length > 0) {
    await prisma.attendance.createMany({
      data: activeStudents.map((s) => ({
        sessionId: lessonSession.id,
        studentId: s.studentId,
        status: 'PRESENT',
      })),
      skipDuplicates: true,
    })
  }

  await prisma.missedSession.update({
    where: { id: missed.id },
    data: { acknowledged: true },
  })

  return { sessionId: lessonSession.id, created: !existingSession, students: activeStudents.length }
}

/** Lecția chiar nu s-a ținut: doar închide raportul, cu motivul dat. */
export async function markMissedSessionNotHeld(missed, reason = null) {
  await prisma.missedSession.update({
    where: { id: missed.id },
    data: {
      acknowledged: true,
      ...(reason ? { reason } : {}),
    },
  })
  return { acknowledged: true }
}
