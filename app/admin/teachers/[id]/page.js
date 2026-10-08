export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import prisma from '@/lib/prisma'
import TeacherForm from '@/components/admin/TeacherForm'
import { checkPermission } from '@/lib/permissions'
import { getCurrentUser } from '@/lib/session'
import { 
  AcademicCapIcon, 
  UserGroupIcon, 
  CheckCircleIcon,
  XCircleIcon,
  PauseCircleIcon,
  ArrowRightStartOnRectangleIcon,
  ClockIcon,
  CalendarDaysIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'

export default async function TeacherDetailPage({ params }) {
  const { id } = await params
  
  const teacher = await prisma.user.findUnique({
    where: { id },
    include: {
      teacherGroups: {
        include: {
          groupStudents: {
            include: {
              student: true
            }
          },
          lessonSessions: {
            include: {
              attendances: true
            },
            orderBy: { date: 'desc' }
          }
        }
      },
      makeupLessons: {
        include: {
          group: true,
          students: true
        }
      }
    }
  })

  if (!teacher || !['TEACHER', 'ADMIN'].includes(teacher.role)) {
    notFound()
  }

  const currentUser = await getCurrentUser()
  const userIsSuperAdmin = currentUser?.role === 'SUPERADMIN'
  
  const canEdit = await checkPermission('teachers.edit')
  
  // Only superadmin can edit other admins
  const canEditThisUser = canEdit.allowed && (userIsSuperAdmin || teacher.role === 'TEACHER')

  // Calculate statistics
  const stats = {
    totalGroups: teacher.teacherGroups.length,
    activeGroups: teacher.teacherGroups.filter(g => g.active).length,
    totalStudents: 0,
    activeStudents: 0,
    pausedStudents: 0,
    leftStudents: 0,
    completedStudents: 0,
    totalSessions: 0,
    totalAttendances: 0,
    presentCount: 0,
    absentCount: 0,
    studentsWithZeroLessons: 0,
    studentsWithLowLessons: 0,
    totalMakeupLessons: teacher.makeupLessons.length,
    completedMakeups: teacher.makeupLessons.filter(m => m.status === 'COMPLETED').length
  }

  // Group-level stats
  const groupStats = teacher.teacherGroups.map(group => {
    const activeStudents = group.groupStudents.filter(gs => gs.status === 'ACTIVE' || !gs.status)
    const pausedStudents = group.groupStudents.filter(gs => gs.status === 'PAUSED')
    const leftStudents = group.groupStudents.filter(gs => gs.status === 'LEFT')
    const completedStudents = group.groupStudents.filter(gs => gs.status === 'COMPLETED')
    const transferredStudents = group.groupStudents.filter(gs => gs.status === 'TRANSFERRED')
    
    let totalPresent = 0
    let totalAbsent = 0
    
    for (const session of group.lessonSessions) {
      for (const attendance of session.attendances) {
        if (attendance.status === 'PRESENT') totalPresent++
        else totalAbsent++
      }
    }
    
    const attendanceRate = (totalPresent + totalAbsent) > 0 
      ? Math.round((totalPresent / (totalPresent + totalAbsent)) * 100) 
      : 0

    // Update global stats
    stats.totalStudents += group.groupStudents.length
    stats.activeStudents += activeStudents.length
    stats.pausedStudents += pausedStudents.length
    stats.leftStudents += leftStudents.length
    stats.completedStudents += completedStudents.length
    stats.transferredStudents = (stats.transferredStudents || 0) + transferredStudents.length
    stats.totalSessions += group.lessonSessions.length
    stats.presentCount += totalPresent
    stats.absentCount += totalAbsent
    stats.studentsWithZeroLessons += activeStudents.filter(gs => gs.lessonsRemaining === 0).length
    stats.studentsWithLowLessons += activeStudents.filter(gs => gs.lessonsRemaining > 0 && gs.lessonsRemaining <= 2).length

    return {
      id: group.id,
      name: group.name,
      levelName: group.level,
      active: group.active,
      totalStudents: group.groupStudents.length,
      activeStudents: activeStudents.length,
      pausedStudents: pausedStudents.length,
      leftStudents: leftStudents.length,
      completedStudents: completedStudents.length,
      transferredStudents: transferredStudents.length,
      totalSessions: group.lessonSessions.length,
      attendanceRate,
      zeroLessons: activeStudents.filter(gs => gs.lessonsRemaining === 0).length,
      lowLessons: activeStudents.filter(gs => gs.lessonsRemaining > 0 && gs.lessonsRemaining <= 2).length
    }
  })

  stats.totalAttendances = stats.presentCount + stats.absentCount
  const overallAttendanceRate = stats.totalAttendances > 0 
    ? Math.round((stats.presentCount / stats.totalAttendances) * 100) 
    : 0

  return (
    <div className="space-y-4 xs:space-y-6">
      {/* Header */}
      <div className="space-y-3 xs:space-y-0 xs:flex xs:items-center xs:justify-between">
        <div className="space-y-2 xs:space-y-0">
          <Link
            href="/admin/teachers"
            className="text-indigo-600 hover:text-indigo-700 text-xs xs:text-sm mb-2 inline-block"
          >
            ← Înapoi la profesori
          </Link>
          <div className="flex items-center gap-2 xs:gap-4">
            {teacher.image ? (
              <Image
                src={teacher.image}
                alt={teacher.name || 'Profesor'}
                width={56}
                height={56}
                className="w-12 h-12 xs:w-14 xs:h-14 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 xs:w-14 xs:h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-lg xs:text-xl font-bold">
                  {teacher.name?.charAt(0) || teacher.email.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-lg xs:text-2xl font-bold text-gray-900 truncate">{teacher.name || 'Fără nume'}</h1>
              <p className="text-sm xs:text-base text-gray-600 truncate">{teacher.email}</p>
            </div>
          </div>
        </div>
        <span className={`px-2.5 xs:px-3 py-0.5 xs:py-1 rounded-full text-xs xs:text-sm font-medium inline-block ${
          teacher.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {teacher.active ? 'Activ' : 'Inactiv'}
        </span>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 xs:gap-4">
        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 xs:gap-3">
            <div className="p-1.5 xs:p-2 bg-indigo-100 rounded-lg flex-shrink-0">
              <AcademicCapIcon className="w-4 h-4 xs:w-5 xs:h-5 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] xs:text-xs text-gray-500 truncate">Grupe</p>
              <p className="text-base xs:text-xl font-bold text-gray-900">{stats.totalGroups}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 xs:gap-3">
            <div className="p-1.5 xs:p-2 bg-green-100 rounded-lg flex-shrink-0">
              <UserGroupIcon className="w-4 h-4 xs:w-5 xs:h-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] xs:text-xs text-gray-500 truncate">Elevi Activi</p>
              <p className="text-base xs:text-xl font-bold text-gray-900">{stats.activeStudents}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 xs:gap-3">
            <div className="p-1.5 xs:p-2 bg-amber-100 rounded-lg flex-shrink-0">
              <PauseCircleIcon className="w-4 h-4 xs:w-5 xs:h-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] xs:text-xs text-gray-500 truncate">Pe Pauză</p>
              <p className="text-base xs:text-xl font-bold text-gray-900">{stats.pausedStudents}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 xs:gap-3">
            <div className="p-1.5 xs:p-2 bg-red-100 rounded-lg flex-shrink-0">
              <ArrowRightStartOnRectangleIcon className="w-4 h-4 xs:w-5 xs:h-5 text-red-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] xs:text-xs text-gray-500 truncate">Plecați</p>
              <p className="text-base xs:text-xl font-bold text-gray-900">{stats.leftStudents}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 xs:gap-3">
            <div className="p-1.5 xs:p-2 bg-blue-100 rounded-lg flex-shrink-0">
              <CheckCircleIcon className="w-4 h-4 xs:w-5 xs:h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] xs:text-xs text-gray-500 truncate">Terminat cursul</p>
              <p className="text-base xs:text-xl font-bold text-gray-900">{stats.completedStudents}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 xs:gap-3">
            <div className="p-1.5 xs:p-2 bg-purple-100 rounded-lg flex-shrink-0">
              <ChartBarIcon className="w-4 h-4 xs:w-5 xs:h-5 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] xs:text-xs text-gray-500 truncate">Prezență</p>
              <p className="text-base xs:text-xl font-bold text-gray-900">{overallAttendanceRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 xs:gap-4">
        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 xs:gap-3">
            <div className="p-1.5 xs:p-2 bg-teal-100 rounded-lg flex-shrink-0">
              <CalendarDaysIcon className="w-4 h-4 xs:w-5 xs:h-5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] xs:text-xs text-gray-500 truncate">Total Sesiuni</p>
              <p className="text-base xs:text-xl font-bold text-gray-900">{stats.totalSessions}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 xs:gap-3">
            <div className="p-1.5 xs:p-2 bg-cyan-100 rounded-lg flex-shrink-0">
              <ClockIcon className="w-4 h-4 xs:w-5 xs:h-5 text-cyan-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] xs:text-xs text-gray-500 truncate">Recuperări</p>
              <p className="text-base xs:text-xl font-bold text-gray-900">{stats.completedMakeups}/{stats.totalMakeupLessons}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 xs:gap-3">
            <div className="p-1.5 xs:p-2 bg-red-100 rounded-lg flex-shrink-0">
              <XCircleIcon className="w-4 h-4 xs:w-5 xs:h-5 text-red-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] xs:text-xs text-gray-500 truncate">0 Lecții Rămase</p>
              <p className="text-base xs:text-xl font-bold text-red-600">{stats.studentsWithZeroLessons}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 xs:gap-3">
            <div className="p-1.5 xs:p-2 bg-amber-100 rounded-lg flex-shrink-0">
              <XCircleIcon className="w-4 h-4 xs:w-5 xs:h-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] xs:text-xs text-gray-500 truncate">Lecții Puține</p>
              <p className="text-base xs:text-xl font-bold text-amber-600">{stats.studentsWithLowLessons}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Groups Table */}
      <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-3 xs:px-6 py-3 xs:py-4 border-b border-gray-100">
          <h2 className="text-base xs:text-lg font-semibold text-gray-900">Grupele Profesorului</h2>
        </div>
        
        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grupă</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                <span className="flex items-center justify-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Activi
                </span>
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                <span className="flex items-center justify-center gap-1">
                  <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                  Pauză
                </span>
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                <span className="flex items-center justify-center gap-1">
                  <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                  Plecați
                </span>
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                <span className="flex items-center justify-center gap-1">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  Terminat
                </span>
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sesiuni</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Prezență</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Probleme</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acțiuni</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {groupStats.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                  Profesorul nu are grupe asignate
                </td>
              </tr>
            ) : (
              groupStats.map((group) => (
                <tr key={group.id} className={`hover:bg-gray-50 ${!group.active ? 'opacity-60' : ''}`}>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{group.name}</p>
                      <p className="text-sm text-gray-500">{group.levelName}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-green-100 text-green-800">
                      {group.activeStudents}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
                      group.pausedStudents > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {group.pausedStudents}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
                      group.leftStudents > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {group.leftStudents}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
                      group.completedStudents > 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {group.completedStudents}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-gray-600">
                    {group.totalSessions}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
                      group.attendanceRate >= 90 ? 'bg-green-100 text-green-800' :
                      group.attendanceRate >= 70 ? 'bg-amber-100 text-amber-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {group.attendanceRate}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {(group.zeroLessons > 0 || group.lowLessons > 0) ? (
                      <div className="flex items-center justify-center gap-1">
                        {group.zeroLessons > 0 && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full" title="0 lecții">
                            {group.zeroLessons} ⚠️
                          </span>
                        )}
                        {group.lowLessons > 0 && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full" title="1-2 lecții">
                            {group.lowLessons} ⏰
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-green-600">✓</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/groups/${group.id}/students`}
                      className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                    >
                      Vezi elevi
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden divide-y divide-gray-200">
          {groupStats.length === 0 ? (
            <div className="px-3 xs:px-6 py-8 xs:py-12 text-center text-gray-500 text-sm xs:text-base">
              Profesorul nu are grupe asignate
            </div>
          ) : (
            groupStats.map((group) => (
              <div key={group.id} className={`p-3 xs:p-4 space-y-3 ${!group.active ? 'opacity-60' : ''}`}>
                {/* Group Header */}
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm xs:text-base">{group.name}</h3>
                  <p className="text-xs xs:text-sm text-gray-500">{group.levelName}</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-green-50 rounded-lg p-2 border border-green-200">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                      <span className="text-[10px] xs:text-xs text-green-700 font-medium">Activi</span>
                    </div>
                    <p className="text-lg xs:text-xl font-bold text-green-800">{group.activeStudents}</p>
                  </div>

                  <div className="bg-amber-50 rounded-lg p-2 border border-amber-200">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                      <span className="text-[10px] xs:text-xs text-amber-700 font-medium">Pauză</span>
                    </div>
                    <p className="text-lg xs:text-xl font-bold text-amber-800">{group.pausedStudents}</p>
                  </div>

                  <div className="bg-red-50 rounded-lg p-2 border border-red-200">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                      <span className="text-[10px] xs:text-xs text-red-700 font-medium">Plecați</span>
                    </div>
                    <p className="text-lg xs:text-xl font-bold text-red-800">{group.leftStudents}</p>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                      <span className="text-[10px] xs:text-xs text-blue-700 font-medium">Terminat</span>
                    </div>
                    <p className="text-lg xs:text-xl font-bold text-blue-800">{group.completedStudents}</p>
                  </div>
                </div>

                {/* Additional Info */}
                <div className="flex flex-wrap items-center gap-2 text-xs xs:text-sm">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">Sesiuni:</span>
                    <span className="font-medium text-gray-900">{group.totalSessions}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">Prezență:</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      group.attendanceRate >= 90 ? 'bg-green-100 text-green-800' :
                      group.attendanceRate >= 70 ? 'bg-amber-100 text-amber-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {group.attendanceRate}%
                    </span>
                  </div>
                  {(group.zeroLessons > 0 || group.lowLessons > 0) && (
                    <div className="flex items-center gap-1">
                      {group.zeroLessons > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                          {group.zeroLessons} ⚠️
                        </span>
                      )}
                      {group.lowLessons > 0 && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                          {group.lowLessons} ⏰
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Button */}
                <Link
                  href={`/admin/groups/${group.id}/students`}
                  className="block w-full px-3 xs:px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm xs:text-base font-medium hover:bg-indigo-700 transition-colors text-center"
                >
                  Vezi elevi
                </Link>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Student Status Summary */}
      <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-3 xs:p-6">
        <h2 className="text-base xs:text-lg font-semibold text-gray-900 mb-3 xs:mb-4">Sumar Status Elevi</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 xs:gap-4">
          <div className="bg-green-50 rounded-lg xs:rounded-xl p-2.5 xs:p-4 border border-green-200">
            <div className="flex items-center gap-1.5 xs:gap-2 mb-1 xs:mb-2">
              <span className="w-2 h-2 xs:w-3 xs:h-3 bg-green-500 rounded-full flex-shrink-0"></span>
              <span className="font-medium text-green-800 text-xs xs:text-sm">Activi</span>
            </div>
            <p className="text-2xl xs:text-3xl font-bold text-green-700">{stats.activeStudents}</p>
            <p className="text-xs xs:text-sm text-green-600">
              {stats.totalStudents > 0 ? Math.round((stats.activeStudents / stats.totalStudents) * 100) : 0}% din total
            </p>
          </div>

          <div className="bg-amber-50 rounded-lg xs:rounded-xl p-2.5 xs:p-4 border border-amber-200">
            <div className="flex items-center gap-1.5 xs:gap-2 mb-1 xs:mb-2">
              <span className="w-2 h-2 xs:w-3 xs:h-3 bg-amber-500 rounded-full flex-shrink-0"></span>
              <span className="font-medium text-amber-800 text-xs xs:text-sm">Pe Pauză</span>
            </div>
            <p className="text-2xl xs:text-3xl font-bold text-amber-700">{stats.pausedStudents}</p>
            <p className="text-xs xs:text-sm text-amber-600">
              {stats.totalStudents > 0 ? Math.round((stats.pausedStudents / stats.totalStudents) * 100) : 0}% din total
            </p>
          </div>

          <div className="bg-red-50 rounded-lg xs:rounded-xl p-2.5 xs:p-4 border border-red-200">
            <div className="flex items-center gap-1.5 xs:gap-2 mb-1 xs:mb-2">
              <span className="w-2 h-2 xs:w-3 xs:h-3 bg-red-500 rounded-full flex-shrink-0"></span>
              <span className="font-medium text-red-800 text-xs xs:text-sm">Plecați</span>
            </div>
            <p className="text-2xl xs:text-3xl font-bold text-red-700">{stats.leftStudents}</p>
            <p className="text-xs xs:text-sm text-red-600">
              {stats.totalStudents > 0 ? Math.round((stats.leftStudents / stats.totalStudents) * 100) : 0}% din total
            </p>
          </div>

          <div className="bg-blue-50 rounded-lg xs:rounded-xl p-2.5 xs:p-4 border border-blue-200">
            <div className="flex items-center gap-1.5 xs:gap-2 mb-1 xs:mb-2">
              <span className="w-2 h-2 xs:w-3 xs:h-3 bg-blue-500 rounded-full flex-shrink-0"></span>
              <span className="font-medium text-blue-800 text-xs xs:text-sm">Au Terminat</span>
            </div>
            <p className="text-2xl xs:text-3xl font-bold text-blue-700">{stats.completedStudents}</p>
            <p className="text-xs xs:text-sm text-blue-600">
              {stats.totalStudents > 0 ? Math.round((stats.completedStudents / stats.totalStudents) * 100) : 0}% din total
            </p>
          </div>
        </div>
      </div>

      {/* Edit Form */}
      {canEditThisUser && (
        <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-3 xs:p-6">
          <h2 className="text-base xs:text-lg font-semibold text-gray-900 mb-3 xs:mb-4">Editează Informații</h2>
          <TeacherForm teacher={teacher} />
        </div>
      )}
    </div>
  )
}
