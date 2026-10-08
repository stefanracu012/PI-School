'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  CalendarDaysIcon, 
  UserGroupIcon, 
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  PlusIcon,
  AcademicCapIcon,
  ArrowLeftIcon,
  UserPlusIcon,
  DocumentTextIcon,
  TrashIcon
} from '@heroicons/react/24/outline'

export default function MakeupSessionPage({ params }) {
  const { id } = use(params)
  const router = useRouter()
  const [makeup, setMakeup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [availableStudents, setAvailableStudents] = useState([])
  
  // Attendance state for each student
  const [attendance, setAttendance] = useState({})
  const [notes, setNotes] = useState({})
  const [expandedNotes, setExpandedNotes] = useState({})

  useEffect(() => {
    fetchMakeup()
  }, [id])

  const fetchMakeup = async () => {
    try {
      const res = await fetch(`/api/teacher/makeup/${id}`)
      const data = await res.json()
      setMakeup(data)
      
      // Initialize attendance state from existing data
      const initialAttendance = {}
      const initialNotes = {}
      data.students?.forEach(ms => {
        initialAttendance[ms.studentId] = ms.status || 'PENDING'
        initialNotes[ms.studentId] = ms.notes || ''
      })
      setAttendance(initialAttendance)
      setNotes(initialNotes)
      
      // Get available students (those with absences not yet in this makeup)
      const currentStudentIds = data.students?.map(s => s.studentId) || []
      const available = data.group?.groupStudents?.filter(
        gs => !currentStudentIds.includes(gs.studentId)
      ) || []
      setAvailableStudents(available)
    } catch (error) {
      console.error('Error fetching makeup:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddStudent = async (studentId) => {
    setProcessing(true)
    try {
      const res = await fetch(`/api/teacher/makeup/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addStudent', studentId })
      })
      
      if (res.ok) {
        fetchMakeup()
        setShowAddStudent(false)
      } else {
        const data = await res.json()
        alert(data.error || 'Eroare la adăugarea elevului')
      }
    } catch (error) {
      console.error('Error adding student:', error)
    } finally {
      setProcessing(false)
    }
  }

  const handleRemoveStudent = async (studentId) => {
    if (!confirm('Elimini elevul din această recuperare?')) return
    
    setProcessing(true)
    try {
      const res = await fetch(`/api/teacher/makeup/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'removeStudent', studentId })
      })
      
      if (res.ok) {
        fetchMakeup()
      }
    } catch (error) {
      console.error('Error removing student:', error)
    } finally {
      setProcessing(false)
    }
  }

  const handleAttendanceChange = async (studentId, status) => {
    setAttendance(prev => ({ ...prev, [studentId]: status }))
    
    // Update attendance in real-time (for SCHEDULED or IN_PROGRESS)
    if (makeup.status === 'SCHEDULED' || makeup.status === 'IN_PROGRESS') {
      try {
        await fetch(`/api/teacher/makeup/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'updateAttendance', 
            studentId, 
            attendanceStatus: status,
            studentNotes: notes[studentId]
          })
        })
      } catch (error) {
        console.error('Error updating attendance:', error)
      }
    }
  }

  const handleSaveNotes = async (studentId) => {
    if (makeup.status === 'SCHEDULED' || makeup.status === 'IN_PROGRESS') {
      try {
        await fetch(`/api/teacher/makeup/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'updateAttendance', 
            studentId, 
            attendanceStatus: attendance[studentId],
            studentNotes: notes[studentId]
          })
        })
        setExpandedNotes(prev => ({ ...prev, [studentId]: false }))
      } catch (error) {
        console.error('Error saving notes:', error)
      }
    }
  }

  const handleCompleteSession = async () => {
    // Check that all students have attendance marked
    const unmarked = makeup.students?.filter(ms => attendance[ms.studentId] === 'PENDING')
    if (unmarked?.length > 0) {
      alert('Marchează prezența pentru toți elevii înainte de a încheia sesiunea!')
      return
    }
    
    if (!confirm('Închei sesiunea de recuperare? Absențele vor fi scăzute pentru elevii prezenți.')) return
    
    setProcessing(true)
    try {
      const studentAttendance = {}
      makeup.students?.forEach(ms => {
        studentAttendance[ms.studentId] = {
          status: attendance[ms.studentId],
          notes: notes[ms.studentId]
        }
      })
      
      const res = await fetch(`/api/teacher/makeup/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', studentAttendance })
      })
      
      if (res.ok) {
        alert('Sesiunea de recuperare a fost finalizată cu succes!')
        router.push('/teacher/makeup')
      } else {
        const data = await res.json()
        alert(data.error || 'Eroare la finalizarea sesiunii')
      }
    } catch (error) {
      console.error('Error completing session:', error)
    } finally {
      setProcessing(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm('Anulezi această sesiune de recuperare?')) return
    
    setProcessing(true)
    try {
      const res = await fetch(`/api/teacher/makeup/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' })
      })
      
      if (res.ok) {
        router.push('/teacher/makeup')
      } else {
        const data = await res.json()
        alert(data.error || 'Eroare la anularea recuperării')
      }
    } catch (error) {
      console.error('Error canceling:', error)
      alert('Eroare la anularea recuperării')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 xs:h-10 xs:w-10 md:h-12 md:w-12 border-b-2 border-teal-600"></div>
      </div>
    )
  }

  if (!makeup) {
    return (
      <div className="text-center py-8 xs:py-10 md:py-12 px-3">
        <p className="text-gray-500 text-sm xs:text-base">Sesiunea nu a fost găsită</p>
        <Link href="/teacher/makeup" className="text-teal-600 hover:underline mt-2 inline-block text-sm xs:text-base">
          ← Înapoi la recuperări
        </Link>
      </div>
    )
  }

  const isScheduled = makeup.status === 'SCHEDULED'
  const isInProgress = makeup.status === 'IN_PROGRESS'
  const isCompleted = makeup.status === 'COMPLETED'
  const isCanceled = makeup.status === 'CANCELED'
  
  // Check if scheduled time has passed
  // scheduledAt is stored in UTC with 'Z' suffix
  // The time entered (e.g., 13:00) is stored as 13:00 UTC
  // But user expects it to mean 13:00 LOCAL time
  // So we need to compare: is current LOCAL time >= scheduled time shown?
  const scheduledTime = new Date(makeup.scheduledAt)
  const now = new Date()
  
  // Get current local time components
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 
                           now.getHours(), now.getMinutes(), now.getSeconds())
  
  // Get scheduled time in UTC components but treat them as local
  // scheduledTime is in UTC, but we displayed it with timeZone: 'UTC', so user sees the raw UTC values
  // User entered 13:00, it was stored as 13:00Z, displayed as 13:00
  // So we need to compare: local time >= UTC time value interpreted as local
  const scheduledLocal = new Date(
    scheduledTime.getUTCFullYear(),
    scheduledTime.getUTCMonth(),
    scheduledTime.getUTCDate(),
    scheduledTime.getUTCHours(),
    scheduledTime.getUTCMinutes(),
    scheduledTime.getUTCSeconds()
  )
  
  const canFinalize = nowLocal >= scheduledLocal

  return (
    <div className="space-y-3 xs:space-y-4 md:space-y-6">
      {/* Back Link */}
      <Link 
        href="/teacher/makeup" 
        className="inline-flex items-center gap-1 xs:gap-1.5 md:gap-2 text-gray-600 hover:text-teal-600 transition-colors text-xs xs:text-sm md:text-base"
      >
        <ArrowLeftIcon className="w-3 h-3 xs:w-3.5 xs:h-3.5 md:w-4 md:h-4" />
        Înapoi la Recuperări
      </Link>

      {/* Header */}
      <div className={`rounded-xl xs:rounded-2xl p-3 xs:p-4 sm:p-5 md:p-6 text-white ${
        isCompleted ? 'bg-gradient-to-r from-green-600 to-green-700' :
        isCanceled ? 'bg-gradient-to-r from-gray-500 to-gray-600' :
        isInProgress ? 'bg-gradient-to-r from-amber-500 to-amber-600' :
        'bg-gradient-to-r from-teal-600 to-teal-700'
      }`}>
        <div className="flex flex-col xs:flex-row items-start justify-between gap-3">
          <div className="flex-1 w-full xs:w-auto">
            <div className="flex items-center gap-2 xs:gap-3 mb-2 xs:mb-2">
              <div className="p-1.5 xs:p-2 bg-white/20 rounded-lg">
                <CalendarDaysIcon className="w-5 h-5 xs:w-5 xs:h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <h1 className="text-base xs:text-lg sm:text-xl md:text-2xl font-bold leading-tight">Sesiune de Recuperare</h1>
                <p className="text-white/80 text-[10px] xs:text-xs md:text-sm">
                  {makeup.group?.name}{makeup.group?.level ? ` • ${makeup.group.level}` : ''}
                </p>
              </div>
            </div>
            <div className="ml-0 xs:ml-9 md:ml-11 mt-2 xs:mt-3 space-y-1">
              <p className="flex items-center gap-1.5 xs:gap-2 text-xs xs:text-sm md:text-base">
                <CalendarDaysIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5" />
                <span className="hidden xs:inline">{new Date(makeup.scheduledAt).toLocaleString('ro-RO', {
                  timeZone: 'UTC',
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</span>
                <span className="xs:hidden">{new Date(makeup.scheduledAt).toLocaleString('ro-RO', {
                  timeZone: 'UTC',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</span>
              </p>
              <p className="flex items-center gap-1.5 xs:gap-2 text-xs xs:text-sm md:text-base">
                <UserGroupIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5" />
                {makeup.students?.length || 0} elevi
              </p>
            </div>
          </div>
          
          {/* Status Badge */}
          <div className={`px-2.5 xs:px-3 md:px-4 py-1.5 xs:py-2 rounded-lg xs:rounded-xl font-semibold text-[10px] xs:text-xs md:text-sm whitespace-nowrap ${
            isCompleted ? 'bg-white/20' :
            isCanceled ? 'bg-white/20' :
            isInProgress ? 'bg-white/20' :
            'bg-white/20'
          }`}>
            {isScheduled && '📅 Programată'}
            {isInProgress && '🟢 În desfășurare'}
            {isCompleted && '✓ Finalizată'}
            {isCanceled && '✕ Anulată'}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {(isScheduled || isInProgress) && (
        <div className="flex justify-end">
          <button
            onClick={handleCancel}
            disabled={processing}
            className="px-3 xs:px-4 md:px-5 py-2 xs:py-2.5 bg-red-100 text-red-700 rounded-lg xs:rounded-xl hover:bg-red-200 font-medium transition-colors text-xs xs:text-sm md:text-base"
          >
            Anulează Sesiunea
          </button>
        </div>
      )}

      {/* Students List */}
      <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-3 xs:px-4 md:px-6 py-3 xs:py-4 md:py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-slate-50 flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2 xs:gap-3">
          <div className="flex items-center gap-2 xs:gap-3 flex-1">
            <div className="p-1.5 xs:p-2 bg-teal-100 rounded-lg">
              <UserGroupIcon className="w-4 h-4 xs:w-5 xs:h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-sm xs:text-base md:text-lg font-semibold text-gray-900">
                Elevi ({makeup.students?.length || 0})
              </h2>
              <p className="text-[10px] xs:text-xs md:text-sm text-gray-500 hidden xs:block">
                {(isScheduled || isInProgress) ? 'Marchează prezența' : 'Elevii din recuperare'}
              </p>
            </div>
          </div>
          
          {(isScheduled || isInProgress) && availableStudents.length > 0 && (
            <button
              onClick={() => setShowAddStudent(true)}
              className="flex items-center gap-1.5 xs:gap-2 px-2.5 xs:px-3 md:px-4 py-1.5 xs:py-2 bg-teal-100 text-teal-700 rounded-lg xs:rounded-xl hover:bg-teal-200 font-medium transition-colors text-[10px] xs:text-xs md:text-sm"
            >
              <UserPlusIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5" />
              <span className="hidden xs:inline">Adaugă Elev</span>
              <span className="xs:hidden">Adaugă</span>
            </button>
          )}
        </div>

        {makeup.students?.length === 0 ? (
          <div className="p-6 xs:p-8 md:p-12 text-center">
            <div className="w-12 h-12 xs:w-14 xs:h-14 md:w-16 md:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 xs:mb-4">
              <UserGroupIcon className="w-6 h-6 xs:w-7 xs:h-7 md:w-8 md:h-8 text-gray-400" />
            </div>
            <h3 className="text-base xs:text-lg font-semibold text-gray-900 mb-1 px-2">Niciun elev adăugat</h3>
            <p className="text-xs xs:text-sm md:text-base text-gray-500 mb-3 xs:mb-4 px-2">Adaugă elevi cu absențe</p>
            {availableStudents.length > 0 && (
              <button
                onClick={() => setShowAddStudent(true)}
                className="inline-flex items-center gap-1.5 xs:gap-2 px-3 xs:px-4 md:px-5 py-2 xs:py-2.5 bg-teal-600 text-white rounded-lg xs:rounded-xl hover:bg-teal-700 font-medium text-xs xs:text-sm md:text-base"
              >
                <UserPlusIcon className="w-4 h-4 xs:w-5 xs:h-5" />
                Adaugă Elev
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {makeup.students?.map((ms) => (
              <div key={ms.id} className="p-2.5 xs:p-3 md:p-5">
                <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2 xs:gap-3">
                  <div className="flex items-center gap-2 xs:gap-3 md:gap-4 flex-1 w-full xs:w-auto">
                    <div className="relative flex-shrink-0">
                      <div className={`w-10 h-10 xs:w-12 xs:h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center ${
                        attendance[ms.studentId] === 'PRESENT' ? 'bg-green-100' :
                        attendance[ms.studentId] === 'ABSENT' ? 'bg-red-100' :
                        'bg-gray-100'
                      }`}>
                        <span className={`text-base xs:text-lg md:text-xl font-semibold ${
                          attendance[ms.studentId] === 'PRESENT' ? 'text-green-600' :
                          attendance[ms.studentId] === 'ABSENT' ? 'text-red-600' :
                          'text-gray-600'
                        }`}>
                          {ms.student?.fullName?.charAt(0) || 'E'}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 text-sm xs:text-base md:text-lg truncate">{ms.student?.fullName}</h3>
                      <p className="text-[10px] xs:text-xs md:text-sm text-gray-500 truncate">
                        {ms.student?.parentPhone && `📞 ${ms.student.parentPhone}`}
                      </p>
                      {ms.notes && !expandedNotes[ms.studentId] && (
                        <p className="text-[10px] xs:text-xs md:text-sm text-gray-600 mt-1 bg-gray-50 px-1.5 xs:px-2 py-0.5 xs:py-1 rounded truncate">
                          💬 {ms.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Attendance Controls */}
                  {(isScheduled || isInProgress) && (
                    <div className="flex items-center gap-1 xs:gap-1.5 md:gap-2 w-full xs:w-auto">
                      {/* Notes button */}
                      <button
                        onClick={() => setExpandedNotes(prev => ({ ...prev, [ms.studentId]: !prev[ms.studentId] }))}
                        className={`p-1.5 xs:p-2 md:p-2.5 rounded-lg xs:rounded-xl transition-colors ${
                          expandedNotes[ms.studentId] || notes[ms.studentId]
                            ? 'bg-teal-100 text-teal-700'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                        title="Notițe"
                      >
                        <DocumentTextIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5" />
                      </button>
                      
                      {/* Attendance buttons */}
                      <button
                        onClick={() => handleAttendanceChange(ms.studentId, 'PRESENT')}
                        className={`flex items-center gap-1 xs:gap-1.5 px-2 xs:px-3 md:px-4 py-1.5 xs:py-2 md:py-2.5 rounded-lg xs:rounded-xl font-semibold transition-all text-[10px] xs:text-xs md:text-sm ${
                          attendance[ms.studentId] === 'PRESENT'
                            ? 'bg-green-600 text-white shadow-lg'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        <CheckCircleIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5" />
                        <span className="hidden xs:inline">Prezent</span>
                        <span className="xs:hidden">P</span>
                      </button>
                      <button
                        onClick={() => handleAttendanceChange(ms.studentId, 'ABSENT')}
                        className={`flex items-center gap-1 xs:gap-1.5 px-2 xs:px-3 md:px-4 py-1.5 xs:py-2 md:py-2.5 rounded-lg xs:rounded-xl font-semibold transition-all text-[10px] xs:text-xs md:text-sm ${
                          attendance[ms.studentId] === 'ABSENT'
                            ? 'bg-red-600 text-white shadow-lg'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        <XCircleIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5" />
                        <span className="hidden xs:inline">Absent</span>
                        <span className="xs:hidden">A</span>
                      </button>
                      
                      {/* Remove student */}
                      <button
                        onClick={() => handleRemoveStudent(ms.studentId)}
                        className="p-1.5 xs:p-2 md:p-2.5 bg-gray-100 text-gray-500 rounded-lg xs:rounded-xl hover:bg-red-100 hover:text-red-600 transition-colors"
                        title="Elimină"
                      >
                        <TrashIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5" />
                      </button>
                    </div>
                  )}

                  {/* Completed status display */}
                  {isCompleted && (
                    <span className={`px-2.5 xs:px-3 md:px-4 py-1.5 xs:py-2 rounded-lg xs:rounded-xl font-semibold text-[10px] xs:text-xs md:text-sm ${
                      ms.status === 'PRESENT' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {ms.status === 'PRESENT' ? '✓ Prezent' : '✕ Absent'}
                    </span>
                  )}
                </div>

                {/* Expanded Notes Section */}
                {expandedNotes[ms.studentId] && (isScheduled || isInProgress) && (
                  <div className="mt-2 xs:mt-3 md:mt-4 ml-0 xs:ml-14 md:ml-18 pl-0 xs:pl-3 md:pl-4 border-l-0 xs:border-l-2 border-teal-200">
                    <textarea
                      value={notes[ms.studentId] || ''}
                      onChange={(e) => setNotes(prev => ({ ...prev, [ms.studentId]: e.target.value }))}
                      placeholder="Notițe despre elev..."
                      className="w-full px-2.5 xs:px-3 md:px-4 py-2 xs:py-2.5 md:py-3 border border-gray-200 rounded-lg xs:rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 resize-none text-xs xs:text-sm md:text-base"
                      rows={2}
                    />
                    <div className="flex justify-end mt-1.5 xs:mt-2">
                      <button
                        onClick={() => handleSaveNotes(ms.studentId)}
                        className="px-3 xs:px-4 py-1.5 xs:py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-[10px] xs:text-xs md:text-sm font-medium"
                      >
                        Salvează
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Complete Session Button */}
      {(isScheduled || isInProgress) && makeup.students?.length > 0 && (
        <div className="space-y-2">
          {!canFinalize && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 text-center">
              <p className="text-amber-700 font-medium text-[10px] xs:text-xs md:text-sm px-2">
                ⏰ Poți finaliza după <span className="hidden xs:inline">{scheduledTime.toLocaleString('ro-RO', {
                  timeZone: 'UTC',
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</span><span className="xs:hidden">{scheduledTime.toLocaleString('ro-RO', {
                  timeZone: 'UTC',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</span>
              </p>
            </div>
          )}
          <button
            onClick={handleCompleteSession}
            disabled={processing || !canFinalize}
            className={`w-full flex items-center justify-center gap-1.5 xs:gap-2 px-3 xs:px-4 md:px-6 py-2.5 xs:py-3 md:py-4 rounded-lg xs:rounded-xl font-bold text-xs xs:text-sm sm:text-base md:text-lg shadow-lg transition-all ${
              canFinalize 
                ? 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-700 hover:to-green-800' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            } disabled:opacity-50`}
          >
            <CheckCircleIcon className="w-4 h-4 xs:w-5 xs:h-5 md:w-6 md:h-6" />
            <span className="hidden xs:inline">{canFinalize ? 'Finalizează Sesiunea de Recuperare' : 'Așteaptă ora programată...'}</span>
            <span className="xs:hidden">{canFinalize ? 'Finalizează' : 'Așteaptă...'}</span>
          </button>
        </div>
      )}

      {/* Session Notes */}
      {makeup.notes && (
        <div className="bg-gray-50 rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 border border-gray-100">
          <p className="text-xs xs:text-sm font-medium text-gray-700 mb-1">Notițe sesiune:</p>
          <p className="text-gray-600 text-[10px] xs:text-xs md:text-sm">{makeup.notes}</p>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 xs:p-4">
          <div className="bg-white rounded-xl xs:rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-3 xs:px-4 md:px-6 py-3 xs:py-4 md:py-5 text-white rounded-t-xl xs:rounded-t-2xl">
              <div className="flex items-center gap-2 xs:gap-3">
                <div className="p-1.5 xs:p-2 bg-white/20 rounded-lg">
                  <UserPlusIcon className="w-4 h-4 xs:w-5 xs:h-5" />
                </div>
                <div>
                  <h3 className="text-base xs:text-lg font-semibold">Adaugă Elev</h3>
                  <p className="text-teal-100 text-[10px] xs:text-xs md:text-sm">Selectează un elev cu absențe</p>
                </div>
              </div>
            </div>
            
            <div className="p-2.5 xs:p-3 md:p-4 max-h-80 overflow-y-auto">
              {availableStudents.length === 0 ? (
                <p className="text-center text-gray-500 py-6 xs:py-8 text-xs xs:text-sm md:text-base px-2">
                  Nu mai sunt elevi cu absențe disponibili
                </p>
              ) : (
                <div className="space-y-1.5 xs:space-y-2">
                  {availableStudents.map((gs) => (
                    <button
                      key={gs.id}
                      onClick={() => handleAddStudent(gs.studentId)}
                      disabled={processing}
                      className="w-full flex items-center gap-2 xs:gap-3 p-2.5 xs:p-3 md:p-4 bg-gray-50 hover:bg-teal-50 rounded-lg xs:rounded-xl transition-colors text-left"
                    >
                      <div className="w-9 h-9 xs:w-10 xs:h-10 md:w-12 md:h-12 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-gray-600 font-semibold text-sm xs:text-base">
                          {gs.student?.fullName?.charAt(0) || 'E'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-xs xs:text-sm md:text-base truncate">{gs.student?.fullName}</p>
                        <p className="text-[10px] xs:text-xs md:text-sm text-red-600 font-medium">
                          {gs.absences} {gs.absences === 1 ? 'absență' : 'absențe'}
                        </p>
                      </div>
                      <PlusIcon className="w-4 h-4 xs:w-5 xs:h-5 text-teal-600 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="px-3 xs:px-4 md:px-6 py-2.5 xs:py-3 md:py-4 border-t border-gray-100">
              <button
                onClick={() => setShowAddStudent(false)}
                className="w-full px-3 xs:px-4 py-2 xs:py-2.5 bg-gray-100 text-gray-700 rounded-lg xs:rounded-xl hover:bg-gray-200 font-medium text-xs xs:text-sm md:text-base"
              >
                Închide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
