import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarDaysIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'

export default async function TeacherAttendancePage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Get all sessions for teacher's groups
  const sessions = await prisma.lessonSession.findMany({
    where: {
      group: { teacherId: session.user.id }
    },
    include: {
      group: {
        include: { course: true }
      },
      attendances: {
        include: { student: true }
      }
    },
    orderBy: { date: 'desc' },
    take: 50
  })

  return (
    <div className="space-y-4 xs:space-y-5 md:space-y-6">
      <div>
        <h1 className="text-xl xs:text-2xl md:text-3xl font-bold text-gray-900">Istoric Prezențe</h1>
        <p className="text-gray-600 mt-1 text-xs xs:text-sm md:text-base">Vezi toate sesiunile și prezențele înregistrate</p>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 xs:p-10 md:p-12 text-center">
          <p className="text-gray-500 text-sm xs:text-base">Nu sunt sesiuni înregistrate.</p>
          <Link
            href="/teacher/groups"
            className="inline-block mt-4 text-teal-600 hover:text-teal-700 font-medium text-sm xs:text-base"
          >
            Vezi grupele tale →
          </Link>
        </div>
      ) : (
        <div className="space-y-3 xs:space-y-4">
          {sessions.map(sess => {
            const presentCount = sess.attendances.filter(a => a.status === 'PRESENT').length
            const absentCount = sess.attendances.filter(a => a.status === 'ABSENT').length
            
            // Check if session date has passed midnight
            const sessionDate = new Date(sess.date)
            const now = new Date()
            const sessionEndOfDay = new Date(sessionDate)
            sessionEndOfDay.setHours(23, 59, 59, 999)
            const isPastDue = !sess.lessonsDeducted && now > sessionEndOfDay
            
            return (
              <Link
                key={sess.id}
                href={`/teacher/groups/${sess.groupId}/session/${sess.id}`}
                className="block bg-white rounded-xl shadow-sm border border-gray-100 p-3 xs:p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 xs:gap-4">
                  {/* Date & Group Info */}
                  <div className="flex items-start gap-2.5 xs:gap-3 flex-1 min-w-0">
                    <div className="p-2 xs:p-2.5 bg-teal-100 rounded-lg flex-shrink-0">
                      <CalendarDaysIcon className="w-4 h-4 xs:w-5 xs:h-5 text-teal-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 text-sm xs:text-base">
                        {new Date(sess.date).toLocaleDateString('ro-RO', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </p>
                      <p className="text-xs xs:text-sm text-gray-600 truncate">{sess.group.name}</p>
                      <p className="text-[10px] xs:text-xs text-gray-400 truncate">{sess.group.course.title}</p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-2 xs:gap-3 flex-wrap">
                    <div className="flex items-center gap-1 xs:gap-1.5 px-2 xs:px-2.5 py-1 xs:py-1.5 bg-green-50 rounded-lg">
                      <CheckCircleIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-green-600" />
                      <span className="text-xs xs:text-sm font-medium text-green-700">{presentCount}</span>
                    </div>
                    <div className="flex items-center gap-1 xs:gap-1.5 px-2 xs:px-2.5 py-1 xs:py-1.5 bg-red-50 rounded-lg">
                      <XCircleIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-red-600" />
                      <span className="text-xs xs:text-sm font-medium text-red-700">{absentCount}</span>
                    </div>
                    {sess.lessonsDeducted ? (
                      <span className="px-2 xs:px-2.5 py-1 xs:py-1.5 bg-green-100 text-green-700 text-[10px] xs:text-xs font-medium rounded-lg">
                        ✓ Finalizat
                      </span>
                    ) : isPastDue ? (
                      <span className="px-2 xs:px-2.5 py-1 xs:py-1.5 bg-red-100 text-red-700 text-[10px] xs:text-xs font-medium rounded-lg">
                        ✗ Neefectuat
                      </span>
                    ) : (
                      <span className="px-2 xs:px-2.5 py-1 xs:py-1.5 bg-amber-100 text-amber-700 text-[10px] xs:text-xs font-medium rounded-lg">
                        În așteptare
                      </span>
                    )}
                  </div>

                  {/* Arrow */}
                  <span className="text-teal-600 font-medium text-xs xs:text-sm hidden sm:block flex-shrink-0">
                    Detalii →
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
