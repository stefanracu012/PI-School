import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import dynamic from 'next/dynamic'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
const StartSessionButton = dynamic(() => import('@/components/teacher/StartSessionButton'))
const EditGroupDetailsButton = dynamic(() => import('@/components/teacher/EditGroupDetailsButton'))
import CopyStudentsButton from '@/components/CopyStudentsButton'
import LessonPackagePanel from '@/components/groups/LessonPackagePanel'
import AddPaymentButton from '@/components/admin/AddPaymentButton'
import PaymentCorrectionControls from '@/components/teacher/PaymentCorrectionControls'
import { paidForMonth } from '@/lib/payments'
import TrialLessonsPanel from '@/components/groups/TrialLessonsPanel'
import { 
  AcademicCapIcon, 
  CalendarDaysIcon, 
  ClipboardDocumentCheckIcon,
  PlusIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'

// Cât a achitat elevul pentru luna curentă (null dacă nimic)
const paidThisMonth = (payments = []) => {
  const now = new Date()
  const total = paidForMonth(payments, now.getFullYear(), now.getMonth() + 1)
  return total > 0 ? total : null
}

// Helper pentru formatarea programului
const formatSchedule = (scheduleDays, scheduleTime) => {
  if (!scheduleDays || scheduleDays.length === 0) return null
  
  let times = {}
  try {
    if (scheduleTime && scheduleTime.startsWith('{')) {
      times = JSON.parse(scheduleTime)
    }
  } catch {
    // E string simplu
  }
  
  const isSimple = !scheduleTime || !scheduleTime.startsWith('{')
  const uniqueTimes = [...new Set(Object.values(times))]
  
  // Dacă toate orele sunt identice
  if (isSimple || uniqueTimes.length <= 1) {
    const time = isSimple ? scheduleTime : (uniqueTimes[0] || '')
    return {
      type: 'simple',
      days: scheduleDays,
      time: time
    }
  }
  
  // Ore diferite per zi
  return {
    type: 'complex',
    schedule: scheduleDays.map(day => ({ day, time: times[day] || '' }))
  }
}

export default async function TeacherGroupDetailPage({ params }) {
  const session = await getServerSession(authOptions)
  const { id } = await params

  // Check if a session already exists for today
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      teacher: true,
      branch: true,
      groupStudents: {
        where: {
          status: { notIn: ['LEFT', 'TRANSFERRED'] }  // Exclude elevii plecați și transferați
        },
        include: {
          student: true,
          payments: {
            orderBy: { paymentDate: 'desc' },
          },
        }
      },
      lessonSessions: {
        orderBy: { date: 'desc' },
        take: 10,
        include: {
          attendances: true
        }
      }
    }
  })

  if (!group) {
    notFound()
  }

  // Check if there's already a session today
  const todaySession = group.lessonSessions.find(s => {
    const sessionDate = new Date(s.date)
    return sessionDate >= today && sessionDate < tomorrow
  })

  // Verify teacher owns this group
  if (group.teacherId !== session.user.id && !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
    redirect('/teacher/groups')
  }

  // Count students with low/zero lessons (only active students)
  // Elevii LEFT sunt deja excluși din query
  const activeStudents = group.groupStudents.filter(gs => gs.status === 'ACTIVE' || !gs.status)
  const pausedStudents = group.groupStudents.filter(gs => gs.status === 'PAUSED')

  return (
    <div className="space-y-4 xs:space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 xs:gap-4">
        <div>
          <Link
            href="/teacher/groups"
            className="text-teal-600 hover:text-teal-700 text-xs xs:text-sm mb-1 xs:mb-2 inline-block"
          >
            ← Înapoi la grupe
          </Link>
          <div className="flex flex-wrap items-center gap-2 xs:gap-3">
            <h1 className="text-xl xs:text-2xl md:text-3xl font-bold text-gray-900">{group.name}</h1>
            <span className={`px-2 py-0.5 xs:py-1 text-[10px] xs:text-xs font-medium rounded-full ${
              group.active 
                ? 'bg-green-100 text-green-800' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {group.active ? 'Activ' : 'Inactiv'}
            </span>
          </div>
          <p className="text-gray-600 mt-0.5 xs:mt-1 text-xs xs:text-sm md:text-base">{group.level || 'Fără nivel'}</p>
        </div>
        <div className="flex flex-wrap gap-2 xs:gap-3">
          {todaySession && (
            <Link
              href={`/teacher/groups/${group.id}/session/${todaySession.id}`}
              className="flex items-center gap-1.5 xs:gap-2 bg-teal-600 hover:bg-teal-700 text-white px-3 xs:px-4 md:px-6 py-2 xs:py-2.5 md:py-3 rounded-lg font-medium transition-colors text-xs xs:text-sm md:text-base"
            >
              <ClipboardDocumentCheckIcon className="w-4 h-4 xs:w-5 xs:h-5" />
              <span className="hidden xs:inline">Continuă Sesiunea de Azi</span>
              <span className="xs:hidden">Continuă Sesiunea</span>
            </Link>
          )}
          <StartSessionButton
            groupId={group.id}
            scheduleDays={group.scheduleDays}
            scheduleTime={group.scheduleTime}
            isSuperTeacher={!!session.user?.superTeacher}
            hideRegularStart={!!todaySession}
          />
          <EditGroupDetailsButton 
            group={{
              id: group.id,
              scheduleTime: group.scheduleTime,
              scheduleDays: group.scheduleDays,
              locationDetails: group.locationDetails,
              branchId: group.branchId,
              branch: group.branch,
              locationType: group.locationType
            }} 
            branches={await prisma.branch.findMany({ orderBy: { name: 'asc' } })}
          />
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-3 gap-2 xs:gap-3 md:gap-6">
        <div className="bg-white rounded-lg xs:rounded-xl shadow-sm p-3 xs:p-4 md:p-6">
          <div className="flex flex-col xs:flex-row items-center xs:items-start gap-2 xs:gap-3 md:gap-4">
            <div className="p-2 xs:p-2.5 md:p-3 bg-teal-100 rounded-lg">
              <AcademicCapIcon className="w-4 h-4 xs:w-5 xs:h-5 md:w-6 md:h-6 text-teal-600" />
            </div>
            <div className="text-center xs:text-left">
              <p className="text-[10px] xs:text-xs md:text-sm text-gray-500">Elevi activi</p>
              <p className="text-lg xs:text-xl md:text-2xl font-bold text-gray-900">
                {activeStudents.length}
              </p>
              {pausedStudents.length > 0 && (
                <p className="text-[10px] xs:text-xs text-gray-400">
                  +{pausedStudents.length} în pauză
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg xs:rounded-xl shadow-sm p-3 xs:p-4 md:p-6">
          <div className="flex flex-col xs:flex-row items-center xs:items-start gap-2 xs:gap-3 md:gap-4">
            <div className="p-2 xs:p-2.5 md:p-3 bg-blue-100 rounded-lg flex-shrink-0">
              <CalendarDaysIcon className="w-4 h-4 xs:w-5 xs:h-5 md:w-6 md:h-6 text-blue-600" />
            </div>
            <div className="text-center xs:text-left min-w-0 flex-1">
              <p className="text-[10px] xs:text-xs md:text-sm text-gray-500 mb-1">Program</p>
              {(() => {
                const schedule = formatSchedule(group.scheduleDays, group.scheduleTime)
                if (!schedule) {
                  return <p className="text-xs xs:text-sm md:text-lg font-medium text-gray-400">Nestabilit</p>
                }
                
                if (schedule.type === 'simple') {
                  return (
                    <div>
                      <p className="text-xs xs:text-sm md:text-base font-medium text-gray-900">
                        {schedule.days.join(', ')}
                      </p>
                      {schedule.time && (
                        <p className="text-xs xs:text-sm md:text-lg font-semibold text-blue-600">
                          {schedule.time}
                        </p>
                      )}
                    </div>
                  )
                }
                
                // Complex schedule - show each day on separate line on mobile
                return (
                  <div className="space-y-0.5 xs:space-y-1">
                    {schedule.schedule.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 xs:gap-2 text-xs xs:text-sm md:text-base">
                        <span className="font-medium text-gray-900">{item.day}</span>
                        <span className="text-gray-400">•</span>
                        <span className="font-semibold text-blue-600">{item.time}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg xs:rounded-xl shadow-sm p-3 xs:p-4 md:p-6">
          <div className="flex flex-col xs:flex-row items-center xs:items-start gap-2 xs:gap-3 md:gap-4">
            <div className="p-2 xs:p-2.5 md:p-3 bg-amber-100 rounded-lg">
              <ClipboardDocumentCheckIcon className="w-4 h-4 xs:w-5 xs:h-5 md:w-6 md:h-6 text-amber-600" />
            </div>
            <div className="text-center xs:text-left">
              <p className="text-[10px] xs:text-xs md:text-sm text-gray-500">Sesiuni</p>
              <p className="text-lg xs:text-xl md:text-2xl font-bold text-gray-900">{group.lessonSessions.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Students List */}
      <div className="bg-white rounded-lg xs:rounded-xl shadow-sm p-3 xs:p-4 md:p-6">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3 xs:mb-4">
          <h2 className="text-base xs:text-lg md:text-xl font-bold text-gray-900">Elevii din grupă</h2>
          <CopyStudentsButton
            groupName={group.name}
            variant="teacher"
            students={group.groupStudents.map(gs => {
              const lastPayment = gs.payments?.[0]
              return {
                fullName: gs.student?.fullName,
                parentName: gs.student?.parentName,
                parentEmail: gs.student?.parentEmail,
                parentPhone: gs.student?.parentPhone,
                lastPaymentAmount: lastPayment?.amount ?? null,
                lastPaymentDate: lastPayment?.paymentDate ?? null,
              }
            })}
          />
        </div>
        
        {group.groupStudents.length === 0 ? (
          <p className="text-gray-500 text-center py-6 xs:py-8 text-xs xs:text-sm md:text-base">Nu sunt elevi în această grupă.</p>
        ) : (
          <div className="space-y-2 xs:space-y-3">
            {group.groupStudents.map(gs => {
              const status = gs.status || 'ACTIVE'
              const isInactive = status !== 'ACTIVE'
              
              return (
                <div 
                  key={gs.student?.id || gs.id} 
                  className={`p-2.5 xs:p-3 md:p-4 rounded-lg xs:rounded-xl border ${
                    isInactive ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-gray-50 border-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 xs:gap-3">
                    {/* Student Info */}
                    <div className="flex items-center gap-2 xs:gap-3 min-w-0 flex-1">
                      <div className={`w-8 h-8 xs:w-9 xs:h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isInactive ? 'bg-gray-200' : 'bg-teal-100'
                      }`}>
                        <span className={`font-semibold text-xs xs:text-sm ${
                          isInactive ? 'text-gray-500' : 'text-teal-700'
                        }`}>
                          {gs.student?.fullName?.charAt(0) || 'E'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className={`font-medium text-xs xs:text-sm md:text-base truncate ${isInactive ? 'text-gray-500' : 'text-gray-900'}`}>
                          {gs.student?.fullName || 'Elev'}
                        </p>
                        <div className="flex flex-wrap items-center gap-1 xs:gap-2 mt-0.5">
                          <span className={`inline-flex items-center px-1.5 xs:px-2 py-0.5 rounded-full text-[10px] xs:text-xs font-medium ${
                            status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                            status === 'PAUSED' ? 'bg-amber-100 text-amber-700' :
                            status === 'LEFT' ? 'bg-red-100 text-red-700' :
                            status === 'TRANSFERRED' ? 'bg-purple-100 text-purple-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {status === 'ACTIVE' ? 'Activ' :
                             status === 'PAUSED' ? 'Pauză' :
                             status === 'LEFT' ? 'Plecat' :
                             status === 'TRANSFERRED' ? 'Transferat' : 'Terminat'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* La grupele individuale contează pachetul elevului, nu luna */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {group.billingType === 'INDIVIDUAL' ? (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] xs:text-xs font-medium whitespace-nowrap ${
                          (gs.lessonsRemaining ?? 0) <= 0 ? 'bg-red-100 text-red-800'
                            : (gs.lessonsRemaining ?? 0) <= 2 ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {gs.lessonsRemaining ?? 0} lecții rămase
                        </span>
                      ) : paidThisMonth(gs.payments) ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] xs:text-xs font-medium whitespace-nowrap">
                          achitat {paidThisMonth(gs.payments).toLocaleString('ro-RO')} MDL
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] xs:text-xs font-medium whitespace-nowrap">
                          neachitat
                        </span>
                      )}

                      <AddPaymentButton
                        variant="link"
                        studentName={gs.student?.fullName}
                        groups={[{ groupStudentId: gs.id, groupName: group.name, billingType: group.billingType }]}
                      />

                      {gs.payments?.[0] && (
                        <PaymentCorrectionControls
                          payment={gs.payments[0]}
                          billingType={group.billingType}
                        />
                      )}
                    </div>
                  </div>

                  {/* Contact Info - Hidden on mobile, shown on hover/tap */}
                  {(gs.student?.parentEmail || gs.student?.parentPhone) && (
                    <div className="mt-2 pt-2 border-t border-gray-200/50 flex flex-wrap gap-x-3 gap-y-1 text-[10px] xs:text-xs text-gray-500">
                      {gs.student?.parentPhone && (
                        <a href={`tel:${gs.student.parentPhone}`} className="hover:text-teal-600">
                          📞 {gs.student.parentPhone}
                        </a>
                      )}
                      {gs.student?.parentEmail && (
                        <a href={`mailto:${gs.student.parentEmail}`} className="hover:text-teal-600 truncate">
                          ✉️ {gs.student.parentEmail}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* La o probă contează participanții; la grupele obișnuite, pachetul lunar */}
      {group.isTrial ? (
        <TrialLessonsPanel groupId={group.id} />
      ) : (
        <LessonPackagePanel groupId={group.id} />
      )}

      {/* Recent Sessions */}
      <div className="bg-white rounded-lg xs:rounded-xl shadow-sm p-3 xs:p-4 md:p-6">
        <h2 className="text-base xs:text-lg md:text-xl font-bold text-gray-900 mb-3 xs:mb-4">Sesiuni Recente</h2>
        
        {group.lessonSessions.length === 0 ? (
          <p className="text-gray-500 text-center py-6 xs:py-8 text-xs xs:text-sm md:text-base">Nu sunt sesiuni înregistrate.</p>
        ) : (
          <div className="space-y-2 xs:space-y-3">
            {group.lessonSessions.map(sess => {
              // Check if session date has passed midnight
              const sessionDate = new Date(sess.date)
              const now = new Date()
              const sessionEndOfDay = new Date(sessionDate)
              sessionEndOfDay.setHours(23, 59, 59, 999)
              const isPastDue = !sess.lessonsDeducted && now > sessionEndOfDay
              
              return (
              <Link
                key={sess.id}
                href={`/teacher/groups/${group.id}/session/${sess.id}`}
                className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 xs:gap-3 p-3 xs:p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900 text-xs xs:text-sm md:text-base">
                    {new Date(sess.date).toLocaleDateString('ro-RO', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </p>
                  <p className="text-[10px] xs:text-xs md:text-sm text-gray-500">
                    {sess.attendances.length} prezențe marcate
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {sess.lessonsDeducted ? (
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-[10px] xs:text-xs font-medium rounded-full">
                      ✓ Finalizat
                    </span>
                  ) : isPastDue ? (
                    <span className="px-2 py-1 bg-red-100 text-red-800 text-[10px] xs:text-xs font-medium rounded-full">
                      ✗ Neefectuat
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-amber-100 text-amber-800 text-[10px] xs:text-xs font-medium rounded-full">
                      În așteptare
                    </span>
                  )}
                  <span className="text-teal-600 font-medium text-xs xs:text-sm">Detalii →</span>
                </div>
              </Link>
            )})}
          </div>
        )}
      </div>
    </div>
  )
}
