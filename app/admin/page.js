export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import Image from 'next/image'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import AdminLoading from './loading'
import { getSource } from '@/lib/leads-config'
import { 
  AcademicCapIcon, 
  UserGroupIcon, 
  PauseCircleIcon,
  ArrowRightStartOnRectangleIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  UsersIcon,
  ChatBubbleLeftRightIcon,
  CalendarDaysIcon,
  LockClosedIcon
} from '@heroicons/react/24/outline'

async function AdminDashboardContent() {
  // Read session once — permissions are embedded in the JWT, no extra DB call needed
  const session = await getServerSession(authOptions)
  const isSuperAdmin = session?.user?.role === 'SUPERADMIN'
  const perms = Array.isArray(session?.user?.permissions) ? session.user.permissions : []
  const has = (p) => isSuperAdmin || perms.includes(p)

  const canViewStudents   = { allowed: has('students.view') }
  const canViewGroups     = { allowed: has('groups.view') }
  const canViewTeachers   = { allowed: has('teachers.view') }
  const canViewLeads      = { allowed: has('leads.view') }
  const canViewMissedSessions = { allowed: has('missed-sessions.view') }

  // All data queries in a SINGLE parallel batch — no sequential round-trips
  const [
    studentsCount,
    groupsCount,
    teachers,
    newLeads,
    unacknowledgedMissedSessions
  ] = await Promise.all([
    canViewStudents.allowed ? prisma.student.count() : 0,
    canViewGroups.allowed ? prisma.group.count() : 0,
    canViewTeachers.allowed ? prisma.user.findMany({
      where: { role: 'TEACHER', active: true },
      include: {
        teacherGroups: {
          where: { active: true },
          include: {
            groupStudents: true
          }
        }
      }
    }) : [],
    canViewLeads.allowed ? prisma.lead.findMany({
      where: { status: { in: ['LEAD', 'FARA_RASPUNS'] } },
      take: 5,
      orderBy: { createdAt: 'desc' }
    }) : [],
    canViewMissedSessions.allowed ? prisma.missedSession.findMany({
      where: { acknowledged: false },
      take: 5,
      orderBy: { scheduledDate: 'desc' },
      include: {
        group: { 
          include: { teacher: true } 
        }
      }
    }) : []
  ])

  // Calculate teacher stats
  const teacherStats = teachers.map(teacher => {
    let activeStudents = 0
    let pausedStudents = 0
    let leftStudents = 0
    let completedStudents = 0
    let zeroLessons = 0
    
    for (const group of teacher.teacherGroups) {
      for (const gs of group.groupStudents) {
        const status = gs.status || 'ACTIVE'
        if (status === 'ACTIVE') {
          activeStudents++
          if (gs.lessonsRemaining === 0) zeroLessons++
        }
        else if (status === 'PAUSED') pausedStudents++
        else if (status === 'LEFT') leftStudents++
        else if (status === 'COMPLETED') completedStudents++
      }
    }
    
    return {
      id: teacher.id,
      name: teacher.name || teacher.email,
      email: teacher.email,
      image: teacher.image,
      groupsCount: teacher.teacherGroups.length,
      activeStudents,
      pausedStudents,
      leftStudents,
      completedStudents,
      zeroLessons
    }
  })

  // Total stats across all teachers
  const totalTeacherStats = teacherStats.reduce((acc, t) => ({
    activeStudents: acc.activeStudents + t.activeStudents,
    pausedStudents: acc.pausedStudents + t.pausedStudents,
    leftStudents: acc.leftStudents + t.leftStudents,
    completedStudents: acc.completedStudents + t.completedStudents,
    zeroLessons: acc.zeroLessons + t.zeroLessons
  }), { activeStudents: 0, pausedStudents: 0, leftStudents: 0, completedStudents: 0, zeroLessons: 0 })

  // Build stats array based on permissions
  const stats = []
  if (canViewStudents.allowed) {
    stats.push({ name: 'Elevi', value: studentsCount, color: 'bg-purple-500', Icon: AcademicCapIcon, href: '/admin/students' })
  }
  if (canViewGroups.allowed) {
    stats.push({ name: 'Grupe', value: groupsCount, color: 'bg-orange-500', Icon: UsersIcon, href: '/admin/groups' })
  }

  // Check if user has any permissions at all
  const hasAnyPermission = canViewStudents.allowed || canViewGroups.allowed ||
    canViewTeachers.allowed || canViewLeads.allowed || canViewMissedSessions.allowed

  return (
    <div className="space-y-5 xs:space-y-6 md:space-y-8">
      <div>
        <h1 className="text-lg xs:text-xl md:text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 text-xs xs:text-sm md:text-base">Bine ai venit în panoul de administrare PI School!</p>
      </div>

      {!hasAnyPermission && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <LockClosedIcon className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-amber-800 mb-2">Acces limitat</h3>
          <p className="text-amber-700 text-sm">
            Nu ai permisiuni atribuite. Contactează un administrator pentru a primi acces la funcționalitățile sistemului.
          </p>
        </div>
      )}

      {/* Stats Grid - only show if user has any stats permissions */}
      {stats.length > 0 && (
        <div className={`grid gap-3 xs:gap-4 md:gap-6 ${
          stats.length === 1 ? 'grid-cols-1' :
          stats.length === 2 ? 'grid-cols-2' :
          stats.length === 3 ? 'grid-cols-3' :
          'grid-cols-2 lg:grid-cols-4'
        }`}>
          {stats.map((stat) => (
            <Link key={stat.name} href={stat.href} className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-3 xs:p-4 md:p-6 hover:shadow-md transition-shadow">
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
      )}

      {/* Student Status Overview - only if can view teachers */}
      {canViewTeachers.allowed && (
        <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-3 xs:p-4 md:p-6">
          <h2 className="text-base xs:text-lg font-semibold text-gray-900 mb-3 xs:mb-4">Status Elevi (Total)</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 xs:gap-3 md:gap-4">
            <div className="bg-green-50 rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 border border-green-200">
              <div className="flex items-center gap-1 xs:gap-1.5 md:gap-2 mb-1">
                <UserGroupIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5 text-green-600" />
                <span className="text-[10px] xs:text-xs md:text-sm font-medium text-green-800">Activi</span>
              </div>
              <p className="text-lg xs:text-xl md:text-2xl font-bold text-green-700">{totalTeacherStats.activeStudents}</p>
            </div>
            <div className="bg-amber-50 rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 border border-amber-200">
              <div className="flex items-center gap-1 xs:gap-1.5 md:gap-2 mb-1">
                <PauseCircleIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5 text-amber-600" />
                <span className="text-[10px] xs:text-xs md:text-sm font-medium text-amber-800">Pauză</span>
              </div>
              <p className="text-lg xs:text-xl md:text-2xl font-bold text-amber-700">{totalTeacherStats.pausedStudents}</p>
            </div>
            <div className="bg-red-50 rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 border border-red-200">
              <div className="flex items-center gap-1 xs:gap-1.5 md:gap-2 mb-1">
                <ArrowRightStartOnRectangleIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5 text-red-600" />
                <span className="text-[10px] xs:text-xs md:text-sm font-medium text-red-800">Plecați</span>
              </div>
              <p className="text-lg xs:text-xl md:text-2xl font-bold text-red-700">{totalTeacherStats.leftStudents}</p>
            </div>
            <div className="bg-blue-50 rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 border border-blue-200">
              <div className="flex items-center gap-1 xs:gap-1.5 md:gap-2 mb-1">
                <CheckCircleIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5 text-blue-600" />
                <span className="text-[10px] xs:text-xs md:text-sm font-medium text-blue-800">Terminat</span>
              </div>
              <p className="text-lg xs:text-xl md:text-2xl font-bold text-blue-700">{totalTeacherStats.completedStudents}</p>
            </div>
            <div className="bg-orange-50 rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 border border-orange-200 col-span-2 md:col-span-1">
              <div className="flex items-center gap-1 xs:gap-1.5 md:gap-2 mb-1">
                <ExclamationTriangleIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5 text-orange-600" />
                <span className="text-[10px] xs:text-xs md:text-sm font-medium text-orange-800">Neachitat</span>
              </div>
              <p className="text-lg xs:text-xl md:text-2xl font-bold text-orange-700">{totalTeacherStats.zeroLessons}</p>
            </div>
          </div>
        </div>
      )}

      {/* Contact Messages & Missed Sessions Row - only show if user has permission for either */}
      {(canViewLeads.allowed || canViewMissedSessions.allowed) && (
        <div className={`grid gap-4 xs:gap-5 md:gap-6 ${
          canViewLeads.allowed && canViewMissedSessions.allowed 
            ? 'grid-cols-1 lg:grid-cols-2' 
            : 'grid-cols-1'
        }`}>
          {/* Contact Messages */}
          {canViewLeads.allowed && (
            <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100">
              <div className="px-3 xs:px-4 md:px-6 py-3 xs:py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ChatBubbleLeftRightIcon className="w-4 h-4 xs:w-5 xs:h-5 text-indigo-600" />
                  <h2 className="text-base xs:text-lg font-semibold text-gray-900">Leads de contactat</h2>
                  {newLeads.length > 0 && (
                    <span className="inline-flex items-center px-1.5 xs:px-2 py-0.5 rounded-full text-[10px] xs:text-xs font-medium bg-red-100 text-red-800">
                      {newLeads.length}
                    </span>
                  )}
                </div>
                <Link href="/admin/leads" className="text-xs xs:text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                  Vezi toate →
                </Link>
              </div>
              <div className="divide-y divide-gray-100">
                {newLeads.length === 0 ? (
                  <div className="px-3 xs:px-4 md:px-6 py-6 xs:py-8 text-center text-gray-500 text-xs xs:text-sm">
                    Niciun lead care așteaptă contactare
                  </div>
                ) : (
                  newLeads.map((lead) => (
                    <Link
                      key={lead.id}
                      href={`/admin/leads/${lead.id}`}
                      className="block px-3 xs:px-4 md:px-6 py-3 xs:py-4 hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 text-sm xs:text-base truncate">{lead.name}</p>
                          <p className="text-xs xs:text-sm text-gray-500 truncate">{lead.phone || lead.email || 'Fără contact'}</p>
                          {lead.message && (
                            <p className="text-[10px] xs:text-xs text-gray-400 mt-1 line-clamp-1">{lead.message}</p>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] xs:text-xs font-medium bg-blue-100 text-blue-800">
                            {getSource(lead.source).emoji} {getSource(lead.source).label}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Missed Sessions */}
          {canViewMissedSessions.allowed && (
            <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100">
              <div className="px-3 xs:px-4 md:px-6 py-3 xs:py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDaysIcon className="w-4 h-4 xs:w-5 xs:h-5 text-red-600" />
                  <h2 className="text-base xs:text-lg font-semibold text-gray-900">Lecții Ratate</h2>
                  {unacknowledgedMissedSessions.length > 0 && (
                    <span className="inline-flex items-center px-1.5 xs:px-2 py-0.5 rounded-full text-[10px] xs:text-xs font-medium bg-red-100 text-red-800">
                      {unacknowledgedMissedSessions.length}
                    </span>
                  )}
                </div>
                <Link href="/admin/missed-sessions" className="text-xs xs:text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                  Vezi toate →
                </Link>
              </div>
              <div className="divide-y divide-gray-100">
                {unacknowledgedMissedSessions.length === 0 ? (
                  <div className="px-3 xs:px-4 md:px-6 py-6 xs:py-8 text-center text-gray-500 text-xs xs:text-sm">
                    <CheckCircleIcon className="w-8 h-8 xs:w-10 xs:h-10 text-green-500 mx-auto mb-2" />
                    Nu există lecții ratate neverificate
                  </div>
                ) : (
                  unacknowledgedMissedSessions.map((session) => (
                    <div key={session.id} className="px-3 xs:px-4 md:px-6 py-3 xs:py-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 text-sm xs:text-base truncate">
                            {session.group?.name || 'Grupă necunoscută'}
                          </p>
                          <p className="text-xs xs:text-sm text-gray-500 truncate">
                            {session.group?.teacher?.name || 'Profesor necunoscut'}
                          </p>
                          <p className="text-[10px] xs:text-xs text-gray-400 mt-1">
                            {new Date(session.scheduledDate).toLocaleDateString('ro-RO', { 
                              weekday: 'short', 
                              day: 'numeric', 
                              month: 'short' 
                            })} la {session.scheduledTime}
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] xs:text-xs font-medium bg-red-100 text-red-800">
                            <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
                            Neverificat
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Teachers Stats Table - only if can view teachers */}
      {canViewTeachers.allowed && (
        <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 xs:px-4 md:px-6 py-3 xs:py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base xs:text-lg font-semibold text-gray-900">Statistici Profesori</h2>
            <Link href="/admin/teachers" className="text-xs xs:text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              Vezi toți →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 xs:px-4 md:px-6 py-2 xs:py-3 text-left text-[10px] xs:text-xs font-medium text-gray-500 uppercase">Profesor</th>
                  <th className="px-3 xs:px-4 md:px-6 py-2 xs:py-3 text-center text-[10px] xs:text-xs font-medium text-gray-500 uppercase">Grupe</th>
                  <th className="px-3 xs:px-4 md:px-6 py-2 xs:py-3 text-center text-[10px] xs:text-xs font-medium text-gray-500 uppercase">
                    <span className="flex items-center justify-center gap-1">
                      <span className="w-1.5 h-1.5 xs:w-2 xs:h-2 bg-green-500 rounded-full"></span>
                      Activi
                    </span>
                  </th>
                  <th className="px-3 xs:px-4 md:px-6 py-2 xs:py-3 text-center text-[10px] xs:text-xs font-medium text-gray-500 uppercase">
                    <span className="flex items-center justify-center gap-1">
                      <span className="w-1.5 h-1.5 xs:w-2 xs:h-2 bg-amber-500 rounded-full"></span>
                      Pauză
                    </span>
                  </th>
                  <th className="px-3 xs:px-4 md:px-6 py-2 xs:py-3 text-center text-[10px] xs:text-xs font-medium text-gray-500 uppercase">
                    <span className="flex items-center justify-center gap-1">
                      <span className="w-1.5 h-1.5 xs:w-2 xs:h-2 bg-red-500 rounded-full"></span>
                      Plecați
                    </span>
                  </th>
                  <th className="px-3 xs:px-4 md:px-6 py-2 xs:py-3 text-center text-[10px] xs:text-xs font-medium text-gray-500 uppercase">
                    <span className="flex items-center justify-center gap-1">
                      <span className="w-1.5 h-1.5 xs:w-2 xs:h-2 bg-blue-500 rounded-full"></span>
                      Terminat
                    </span>
                  </th>
                  <th className="px-3 xs:px-4 md:px-6 py-2 xs:py-3 text-center text-[10px] xs:text-xs font-medium text-gray-500 uppercase">
                    <span className="flex items-center justify-center gap-1">
                      <span className="w-1.5 h-1.5 xs:w-2 xs:h-2 bg-orange-500 rounded-full"></span>
                      0 Lecții
                    </span>
                  </th>
                  <th className="px-3 xs:px-4 md:px-6 py-2 xs:py-3 text-right text-[10px] xs:text-xs font-medium text-gray-500 uppercase">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {teacherStats.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 xs:px-4 md:px-6 py-6 xs:py-8 text-center text-gray-500 text-xs xs:text-sm md:text-base">
                      Nu există profesori activi
                    </td>
                  </tr>
                ) : (
                  teacherStats.map((teacher) => (
                    <tr key={teacher.id} className="hover:bg-gray-50">
                      <td className="px-3 xs:px-4 md:px-6 py-3 xs:py-4">
                        <div className="flex items-center gap-2 xs:gap-3">
                          {teacher.image ? (
                            <Image
                              src={teacher.image}
                              alt={teacher.name || 'Profesor'}
                              width={32}
                              height={32}
                              className="w-6 h-6 xs:w-7 xs:h-7 md:w-8 md:h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-6 h-6 xs:w-7 xs:h-7 md:w-8 md:h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                              <span className="text-white text-[10px] xs:text-xs md:text-sm font-medium">
                                {teacher.name?.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 text-xs xs:text-sm md:text-base truncate">{teacher.name}</p>
                          <p className="text-[10px] xs:text-xs text-gray-500 truncate">{teacher.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 xs:px-4 md:px-6 py-3 xs:py-4 text-center">
                      <span className="inline-flex items-center px-1.5 xs:px-2 md:px-2.5 py-0.5 rounded-full text-[10px] xs:text-xs md:text-sm font-medium bg-indigo-100 text-indigo-800">
                        {teacher.groupsCount}
                      </span>
                    </td>
                    <td className="px-3 xs:px-4 md:px-6 py-3 xs:py-4 text-center">
                      <span className="inline-flex items-center px-1.5 xs:px-2 md:px-2.5 py-0.5 rounded-full text-[10px] xs:text-xs md:text-sm font-medium bg-green-100 text-green-800">
                        {teacher.activeStudents}
                      </span>
                    </td>
                    <td className="px-3 xs:px-4 md:px-6 py-3 xs:py-4 text-center">
                      <span className={`inline-flex items-center px-1.5 xs:px-2 md:px-2.5 py-0.5 rounded-full text-[10px] xs:text-xs md:text-sm font-medium ${
                        teacher.pausedStudents > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {teacher.pausedStudents}
                      </span>
                    </td>
                    <td className="px-3 xs:px-4 md:px-6 py-3 xs:py-4 text-center">
                      <span className={`inline-flex items-center px-1.5 xs:px-2 md:px-2.5 py-0.5 rounded-full text-[10px] xs:text-xs md:text-sm font-medium ${
                        teacher.leftStudents > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {teacher.leftStudents}
                      </span>
                    </td>
                    <td className="px-3 xs:px-4 md:px-6 py-3 xs:py-4 text-center">
                      <span className={`inline-flex items-center px-1.5 xs:px-2 md:px-2.5 py-0.5 rounded-full text-[10px] xs:text-xs md:text-sm font-medium ${
                        teacher.completedStudents > 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {teacher.completedStudents}
                      </span>
                    </td>
                    <td className="px-3 xs:px-4 md:px-6 py-3 xs:py-4 text-center">
                      <span className={`inline-flex items-center px-1.5 xs:px-2 md:px-2.5 py-0.5 rounded-full text-[10px] xs:text-xs md:text-sm font-medium ${
                        teacher.zeroLessons > 0 ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {teacher.zeroLessons}
                      </span>
                    </td>
                    <td className="px-3 xs:px-4 md:px-6 py-3 xs:py-4 text-right">
                      <Link
                        href={`/admin/teachers/${teacher.id}`}
                        className="inline-flex items-center gap-0.5 xs:gap-1 text-indigo-600 hover:text-indigo-900 text-[10px] xs:text-xs md:text-sm font-medium"
                      >
                        <ChartBarIcon className="w-3 h-3 xs:w-3.5 xs:h-3.5 md:w-4 md:h-4" />
                        <span className="hidden xs:inline">Detalii</span>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

    </div>
  )
}

export default function AdminDashboard() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminDashboardContent />
    </Suspense>
  )
}
