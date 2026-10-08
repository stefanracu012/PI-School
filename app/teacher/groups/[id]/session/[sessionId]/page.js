import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import AttendanceManager from '@/components/teacher/AttendanceManager'
import SessionCorrectionPanel from '@/components/teacher/SessionCorrectionPanel'

export default async function SessionDetailPage({ params }) {
  const userSession = await getServerSession(authOptions)
  const { id, sessionId } = await params

  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      teacher: true,
      groupStudents: {
        where: {
          status: { notIn: ['LEFT', 'TRANSFERRED'] }  // Exclude elevii plecați și transferați
        },
        include: { student: true }
      }
    }
  })

  if (!group) {
    notFound()
  }

  // Verify teacher owns this group
  if (group.teacherId !== userSession.user.id && !['SUPERADMIN', 'ADMIN'].includes(userSession.user.role)) {
    redirect('/teacher/groups')
  }

  const lessonSession = await prisma.lessonSession.findUnique({
    where: { id: sessionId },
    include: {
      attendances: {
        include: { student: true }
      }
    }
  })

  if (!lessonSession || lessonSession.groupId !== id) {
    notFound()
  }

  // Check if session is older than 24 hours
  const sessionDate = new Date(lessonSession.date)
  const hoursElapsed = (Date.now() - sessionDate.getTime()) / (1000 * 60 * 60)
  const isExpired = hoursElapsed >= 24
  
  // Check if session date has passed midnight (for "Neefectuat" status)
  const now = new Date()
  const sessionEndOfDay = new Date(sessionDate)
  sessionEndOfDay.setHours(23, 59, 59, 999)
  const isPastDue = !lessonSession.lessonsDeducted && now > sessionEndOfDay

  // Prepare attendance data
  const attendanceMap = {}
  lessonSession.attendances.forEach(att => {
    attendanceMap[att.studentId] = att
  })

  const studentsWithAttendance = group.groupStudents.map(gs => ({
    ...gs,
    attendance: attendanceMap[gs.studentId] || null
  }))

  return (
    <div className="space-y-4 xs:space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/teacher/groups/${id}`}
          className="text-teal-600 hover:text-teal-700 text-xs xs:text-sm mb-1.5 xs:mb-2 inline-block"
        >
          ← Înapoi la grupă
        </Link>
        <h1 className="text-lg xs:text-xl md:text-3xl font-bold text-gray-900">
          Sesiune - {new Date(lessonSession.date).toLocaleDateString('ro-RO', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </h1>
        <p className="text-gray-600 mt-0.5 xs:mt-1 text-xs xs:text-sm md:text-base">{group.name}{group.level ? ` • ${group.level}` : ''}</p>
      </div>

      {/* Session Status */}
      <div className="bg-white rounded-xl shadow-sm p-3 xs:p-4 md:p-6">
        <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2 xs:gap-4">
          <h2 className="text-base xs:text-lg md:text-xl font-bold text-gray-900">Status Sesiune</h2>
          {lessonSession.lessonsDeducted ? (
            <span className="px-2.5 xs:px-3 py-1 bg-green-100 text-green-800 text-xs xs:text-sm font-medium rounded-full">
              ✓ Lecții Deduse
            </span>
          ) : isPastDue ? (
            <span className="px-2.5 xs:px-3 py-1 bg-red-100 text-red-800 text-xs xs:text-sm font-medium rounded-full">
              ✗ Neefectuat
            </span>
          ) : (
            <span className="px-2.5 xs:px-3 py-1 bg-amber-100 text-amber-800 text-xs xs:text-sm font-medium rounded-full">
              În Așteptare
            </span>
          )}
        </div>
        {isPastDue && (
          <p className="text-sm text-red-600 mt-2">
            Sesiunea nu a fost finalizată la timp. Lecțiile nu au fost deduse.
          </p>
        )}
      </div>

      {/* Attendance Manager */}
      <AttendanceManager
        sessionId={lessonSession.id}
        groupId={group.id}
        students={studentsWithAttendance}
        lessonsDeducted={lessonSession.lessonsDeducted}
        isExpired={isExpired}
        sessionDate={lessonSession.date}
        billingType={group.billingType}
      />

      {/* Corectare: pentru sesiuni deja procesate, sau oricând pentru data/notițele ei */}
      <SessionCorrectionPanel
        session={{
          id: lessonSession.id,
          date: lessonSession.date,
          notes: lessonSession.notes,
          createdAt: lessonSession.createdAt,
          lessonsDeducted: lessonSession.lessonsDeducted,
          attendances: lessonSession.attendances.map((a) => ({
            id: a.id,
            status: a.status,
            notes: a.notes,
            student: { fullName: a.student?.fullName },
          })),
        }}
        groupId={group.id}
      />
    </div>
  )
}
