import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { 
  UserGroupIcon, 
  AcademicCapIcon,
  ClipboardDocumentCheckIcon,
  ArrowPathIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'

export default async function TeacherDashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Get teacher's groups and statistics
  const [groups, students, recentSessions, makeupLessons] = await Promise.all([
    prisma.group.findMany({
      where: { teacherId: session.user.id, active: true },
      include: {
        course: true,
        groupStudents: {
          where: { status: 'ACTIVE' }
        }
      }
    }),
    prisma.groupStudent.findMany({
      where: {
        group: { teacherId: session.user.id, active: true },
        status: 'ACTIVE'
      },
      include: {
        student: true,
        group: {
          include: { course: true }
        }
      },
      distinct: ['studentId']
    }),
    prisma.lessonSession.findMany({
      where: {
        group: { teacherId: session.user.id }
      },
      orderBy: { date: 'desc' },
      take: 5,
      include: {
        group: {
          include: { course: true }
        },
        attendances: true
      }
    }),
    prisma.makeupLesson.findMany({
      where: {
        group: { teacherId: session.user.id },
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] }
      },
      include: {
        group: {
          include: { course: true }
        },
        students: true
      }
    })
  ])

  const totalStudents = students.length
  const totalGroups = groups.length
  const totalSessions = await prisma.lessonSession.count({
    where: { group: { teacherId: session.user.id } }
  })
  const upcomingMakeups = makeupLessons.length

  const stats = [
    { name: 'Grupe Active', value: totalGroups, color: 'bg-blue-500', Icon: UserGroupIcon, href: '/teacher/groups' },
    { name: 'Elevi Activi', value: totalStudents, color: 'bg-purple-500', Icon: AcademicCapIcon, href: '/teacher/students' },
    { name: 'Sesiuni Total', value: totalSessions, color: 'bg-green-500', Icon: ClipboardDocumentCheckIcon, href: '/teacher/attendance' },
    { name: 'Recuperări', value: upcomingMakeups, color: 'bg-orange-500', Icon: ArrowPathIcon, href: '/teacher/makeup' }
  ]

  return (
    <div className="space-y-5 xs:space-y-6 md:space-y-8">
      <div>
        <h1 className="text-xl xs:text-2xl md:text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 text-xs xs:text-sm md:text-base mt-1">Bine ai venit în portalul pentru profesori!</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 xs:gap-4 md:gap-6">
        {stats.map((stat) => (
          <Link
            key={stat.name}
            href={stat.href}
            className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-3 xs:p-4 md:p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2 xs:gap-0">
              <div className="flex-1">
                <p className="text-[10px] xs:text-xs md:text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-xl xs:text-2xl md:text-3xl font-bold text-gray-900 mt-0.5 xs:mt-1">{stat.value}</p>
              </div>
              <div className={`w-8 h-8 xs:w-10 xs:h-10 md:w-12 md:h-12 ${stat.color} rounded-lg xs:rounded-xl flex items-center justify-center`}>
                <stat.Icon className="w-4 h-4 xs:w-5 xs:h-5 md:w-6 md:h-6 text-white" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 xs:gap-5 md:gap-6">
        {/* Groups Section */}
        <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-4 xs:p-5 md:p-6">
          <div className="flex items-center justify-between mb-3 xs:mb-4">
            <h2 className="text-base xs:text-lg font-semibold text-gray-900">Grupele Mele</h2>
            <Link href="/teacher/groups" className="text-xs xs:text-sm text-teal-600 hover:text-teal-700 font-medium">
              Vezi toate →
            </Link>
          </div>
          {groups.length === 0 ? (
            <p className="text-gray-500 text-xs xs:text-sm">Nu ai grupe asignate</p>
          ) : (
            <div className="space-y-2 xs:space-y-3">
              {groups.slice(0, 3).map(group => (
                <Link
                  key={group.id}
                  href={`/teacher/groups/${group.id}`}
                  className="block p-2.5 xs:p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 text-xs xs:text-sm truncate">{group.name}</p>
                      <p className="text-[10px] xs:text-xs text-gray-500 truncate">{group.course.title}</p>
                    </div>
                    <span className="ml-2 px-1.5 xs:px-2 py-0.5 xs:py-1 bg-blue-100 text-blue-800 text-[10px] xs:text-xs font-medium rounded-full whitespace-nowrap">
                      {group.groupStudents.length} elevi
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Sessions */}
        <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-4 xs:p-5 md:p-6">
          <div className="flex items-center justify-between mb-3 xs:mb-4">
            <h2 className="text-base xs:text-lg font-semibold text-gray-900">Sesiuni Recente</h2>
            <Link href="/teacher/attendance" className="text-xs xs:text-sm text-teal-600 hover:text-teal-700 font-medium">
              Vezi istoric →
            </Link>
          </div>
          {recentSessions.length === 0 ? (
            <p className="text-gray-500 text-xs xs:text-sm">Nu există sesiuni</p>
          ) : (
            <div className="space-y-2 xs:space-y-3">
              {recentSessions.map(session => {
                const presentCount = session.attendances.filter(a => a.status === 'PRESENT').length
                const totalCount = session.attendances.length
                return (
                  <div key={session.id} className="p-2.5 xs:p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 text-xs xs:text-sm truncate">{session.group.name}</p>
                        <p className="text-[10px] xs:text-xs text-gray-500">
                          {new Date(session.date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <span className="ml-2 text-[10px] xs:text-xs font-medium text-gray-600 whitespace-nowrap">
                        {presentCount}/{totalCount}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Makeup Lessons */}
      {makeupLessons.length > 0 && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl xs:rounded-2xl border border-orange-200 p-4 xs:p-5 md:p-6">
          <div className="flex items-center justify-between mb-3 xs:mb-4">
            <div className="flex items-center gap-2 xs:gap-3">
              <div className="p-1.5 xs:p-2 bg-orange-100 rounded-lg">
                <ArrowPathIcon className="w-4 h-4 xs:w-5 xs:h-5 text-orange-600" />
              </div>
              <h2 className="text-base xs:text-lg font-semibold text-gray-900">Recuperări Programate</h2>
            </div>
            <Link href="/teacher/makeup" className="text-xs xs:text-sm text-orange-600 hover:text-orange-700 font-medium">
              Vezi toate →
            </Link>
          </div>
          <div className="space-y-2 xs:space-y-3">
            {makeupLessons.map(makeup => (
              <Link
                key={makeup.id}
                href={`/teacher/makeup/${makeup.id}`}
                className="block p-2.5 xs:p-3 bg-white rounded-lg hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 text-xs xs:text-sm truncate">{makeup.group.name}</p>
                    <p className="text-[10px] xs:text-xs text-gray-500">
                      {new Date(makeup.scheduledAt).toLocaleDateString('ro-RO', { 
                        day: 'numeric', 
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <span className="ml-2 px-1.5 xs:px-2 py-0.5 xs:py-1 bg-orange-100 text-orange-800 text-[10px] xs:text-xs font-medium rounded-full whitespace-nowrap">
                    {makeup.students.length} elevi
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
