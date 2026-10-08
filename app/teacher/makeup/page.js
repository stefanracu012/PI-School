'use client'

import { useState, useEffect } from 'react'
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
  ExclamationTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  EyeIcon
} from '@heroicons/react/24/outline'

export default function MakeupLessonsPage() {
  const router = useRouter()
  const [studentsWithAbsences, setStudentsWithAbsences] = useState([])
  const [makeupLessons, setMakeupLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    groupId: '',
    scheduledAt: '',
    notes: '',
    studentIds: [],
    branchId: '',
    locationDetails: ''
  })
  const [submitting, setSubmitting] = useState(false)
  
  // Date/Time picker state
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedHour, setSelectedHour] = useState('10')
  const [selectedMinute, setSelectedMinute] = useState('00')
  const [currentMonth, setCurrentMonth] = useState(new Date())

  // Groups with absences for the modal
  const [groupsWithAbsences, setGroupsWithAbsences] = useState([])
  
  // Branches and schedule for modal
  const [branches, setBranches] = useState([])
  const [daySchedule, setDaySchedule] = useState([])

  useEffect(() => {
    fetchData()
    fetchBranches()
  }, [])
  
  // Fetch schedule when date changes
  useEffect(() => {
    if (selectedDate) {
      fetchDaySchedule(selectedDate)
    }
  }, [selectedDate])

  // Update formData when date/time changes
  useEffect(() => {
    if (selectedDate) {
      const year = selectedDate.getFullYear()
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
      const day = String(selectedDate.getDate()).padStart(2, '0')
      // Creăm ISO string manual pentru a păstra ora locală
      const isoString = `${year}-${month}-${day}T${selectedHour}:${selectedMinute}:00`
      setFormData(prev => ({ ...prev, scheduledAt: isoString }))
    }
  }, [selectedDate, selectedHour, selectedMinute])

  const fetchData = async () => {
    try {
      const [absencesRes, makeupRes] = await Promise.all([
        fetch('/api/teacher/makeup'),
        fetch('/api/teacher/makeup?list=true')
      ])
      
      const absencesData = await absencesRes.json()
      const makeupData = await makeupRes.json()
      
      const studentsArr = Array.isArray(absencesData) ? absencesData : []
      setStudentsWithAbsences(studentsArr)
      setMakeupLessons(Array.isArray(makeupData) ? makeupData : [])
      
      // Group students by their group
      const groups = {}
      studentsArr.forEach(gs => {
        if (!groups[gs.groupId]) {
          groups[gs.groupId] = {
            groupId: gs.groupId,
            groupName: gs.group?.name,
            levelName: gs.group?.level,
            students: []
          }
        }
        groups[gs.groupId].students.push(gs)
      })
      setGroupsWithAbsences(Object.values(groups))
      
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/teacher/branches')
      const data = await res.json()
      setBranches(data.branches || [])
    } catch (error) {
      console.error('Error fetching branches:', error)
    }
  }
  
  const fetchDaySchedule = async (date) => {
    try {
      const res = await fetch('/api/teacher/schedule')
      const data = await res.json()
      
      // Map day index to Romanian name
      const dayNames = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă']
      const selectedDayName = dayNames[date.getDay()]
      
      // Format selected date for comparison (use local date parts to avoid timezone issues)
      const selectedYear = date.getFullYear()
      const selectedMonth = date.getMonth()
      const selectedDay = date.getDate()
      
      // Helper to parse scheduleTime (can be JSON or simple string)
      const parseTimeForDay = (scheduleTime, dayName) => {
        if (!scheduleTime) return null
        try {
          const parsed = JSON.parse(scheduleTime)
          if (typeof parsed === 'object') {
            return parsed[dayName] || null
          }
        } catch {
          // Not JSON, return as-is
          return scheduleTime
        }
        return scheduleTime
      }
      
      // Filter groups that have sessions on this day
      const scheduleForDay = []
      data.groups?.forEach(group => {
        if (group.scheduleDays?.includes(selectedDayName)) {
          const time = parseTimeForDay(group.scheduleTime, selectedDayName)
          scheduleForDay.push({
            id: group.id,
            name: group.name,
            level: group.level,
            time: time || '--:--',
            branch: group.branch?.name,
            locationDetails: group.locationDetails,
            teacher: group.teacher?.name,
            isMakeup: false
          })
        }
      })
      
      // Add makeup lessons scheduled for this specific date
      // Makeup lessons are stored with time as UTC (the time value itself, not converted)
      data.makeupLessons?.forEach(makeup => {
        const makeupDate = new Date(makeup.scheduledAt)
        // Compare using UTC values since that's how we store the date/time
        const makeupYear = makeupDate.getUTCFullYear()
        const makeupMonth = makeupDate.getUTCMonth()
        const makeupDay = makeupDate.getUTCDate()
        
        if (makeupYear === selectedYear && makeupMonth === selectedMonth && makeupDay === selectedDay) {
          const hours = String(makeupDate.getUTCHours()).padStart(2, '0')
          const minutes = String(makeupDate.getUTCMinutes()).padStart(2, '0')
          scheduleForDay.push({
            id: makeup.id,
            name: makeup.group?.name || 'Recuperare',
            level: 'Recuperare',
            time: `${hours}:${minutes}`,
            branch: makeup.branch?.name,
            locationDetails: makeup.locationDetails,
            teacher: makeup.teacher?.name,
            isMakeup: true,
            status: makeup.status
          })
        }
      })
      
      // Sort by time
      scheduleForDay.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      setDaySchedule(scheduleForDay)
    } catch (error) {
      console.error('Error fetching schedule:', error)
      setDaySchedule([])
    }
  }

  const openModal = (groupId = '') => {
    setSelectedDate(null)
    setSelectedHour('10')
    setSelectedMinute('00')
    setCurrentMonth(new Date())
    setDaySchedule([])
    setFormData({
      groupId: groupId,
      scheduledAt: '',
      notes: '',
      studentIds: [],
      branchId: '',
      locationDetails: ''
    })
    setShowModal(true)
  }

  const handleStudentToggle = (studentId) => {
    setFormData(prev => ({
      ...prev,
      studentIds: prev.studentIds.includes(studentId)
        ? prev.studentIds.filter(id => id !== studentId)
        : [...prev.studentIds, studentId]
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.groupId || !formData.scheduledAt) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/teacher/makeup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: formData.groupId,
          scheduledAt: formData.scheduledAt,
          notes: formData.notes,
          studentIds: formData.studentIds,
          branchId: formData.branchId || null,
          locationDetails: formData.locationDetails || null
        })
      })

      if (res.ok) {
        const newMakeup = await res.json()
        setShowModal(false)
        fetchData()
        // Redirect to the new makeup session page
        router.push(`/teacher/makeup/${newMakeup.id}`)
      } else {
        const data = await res.json()
        alert(data.error || 'Eroare la programarea lecției')
      }
    } catch (error) {
      console.error('Error creating makeup lesson:', error)
      alert('Eroare la programarea lecției')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async (makeupId) => {
    if (!confirm('Anulezi această sesiune de recuperare?')) return

    try {
      const res = await fetch(`/api/teacher/makeup/${makeupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' })
      })

      if (res.ok) {
        fetchData()
      } else {
        const data = await res.json()
        alert(data.error || 'Eroare la anularea recuperării')
      }
    } catch (error) {
      console.error('Error canceling makeup:', error)
      alert('Eroare la anularea recuperării')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    )
  }

  const totalAbsences = studentsWithAbsences.reduce((sum, gs) => sum + (gs.absences || 0), 0)
  const scheduledLessons = makeupLessons.filter(m => m.status === 'SCHEDULED' || m.status === 'IN_PROGRESS')
  const completedLessons = makeupLessons.filter(m => m.status === 'COMPLETED')

  // Get students for selected group in modal
  const selectedGroupStudents = formData.groupId 
    ? groupsWithAbsences.find(g => g.groupId === formData.groupId)?.students || []
    : []

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <div className="p-1.5 sm:p-2 bg-white/20 rounded-lg">
                <CalendarDaysIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold">Lecții de Recuperare</h1>
            </div>
            <p className="text-teal-100 text-xs sm:text-sm ml-8 sm:ml-11">
              Programează și gestionează sesiunile de recuperare
            </p>
          </div>
          
          {groupsWithAbsences.length > 0 && (
            <button
              onClick={() => openModal()}
              className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-3 bg-white text-teal-700 rounded-lg sm:rounded-xl hover:bg-teal-50 font-semibold shadow-lg transition-all text-sm sm:text-base w-full sm:w-auto"
            >
              <PlusIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="sm:inline">Programează Recuperare</span>
            </button>
          )}
        </div>
        
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 xs:gap-3 md:gap-4 mt-4 xs:mt-5 md:mt-6">
          <div className="bg-white/10 rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4">
            <div className="flex items-center gap-1 xs:gap-1.5 md:gap-2">
              <UserGroupIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5 text-teal-200" />
              <span className="text-teal-200 text-[10px] xs:text-xs md:text-sm">Elevi cu absențe</span>
            </div>
            <p className="text-xl xs:text-2xl md:text-3xl font-bold mt-0.5 xs:mt-1">{studentsWithAbsences.length}</p>
          </div>
          <div className="bg-white/10 rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4">
            <div className="flex items-center gap-1 xs:gap-1.5 md:gap-2">
              <ExclamationTriangleIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5 text-teal-200" />
              <span className="text-teal-200 text-[10px] xs:text-xs md:text-sm">Total absențe</span>
            </div>
            <p className="text-xl xs:text-2xl md:text-3xl font-bold mt-0.5 xs:mt-1">{totalAbsences}</p>
          </div>
          <div className="bg-white/10 rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4">
            <div className="flex items-center gap-1 xs:gap-1.5 md:gap-2">
              <ClockIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5 text-teal-200" />
              <span className="text-teal-200 text-[10px] xs:text-xs md:text-sm">Programate</span>
            </div>
            <p className="text-xl xs:text-2xl md:text-3xl font-bold mt-0.5 xs:mt-1">{scheduledLessons.length}</p>
          </div>
          <div className="bg-white/10 rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4">
            <div className="flex items-center gap-1 xs:gap-1.5 md:gap-2">
              <CheckCircleIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5 text-teal-200" />
              <span className="text-teal-200 text-[10px] xs:text-xs md:text-sm">Efectuate</span>
            </div>
            <p className="text-xl xs:text-2xl md:text-3xl font-bold mt-0.5 xs:mt-1">{completedLessons.length}</p>
          </div>
        </div>
      </div>

      {/* Scheduled Makeup Sessions */}
      {scheduledLessons.length > 0 && (
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 sm:px-6 py-3 sm:py-5 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-amber-100 rounded-lg">
                <ClockIcon className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-sm sm:text-lg font-semibold text-gray-900">Sesiuni de Recuperare ({scheduledLessons.length})</h2>
                <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">
                  Sesiunile programate care așteaptă să fie efectuate
                </p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {scheduledLessons.map((makeup) => (
              <div key={makeup.id} className="p-3 sm:p-5 hover:bg-gray-50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                    <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 ${
                      makeup.status === 'IN_PROGRESS' ? 'bg-green-100' : 'bg-amber-100'
                    }`}>
                      {makeup.status === 'IN_PROGRESS' ? (
                        <PlayIcon className="w-5 h-5 sm:w-7 sm:h-7 text-green-600" />
                      ) : (
                        <ClockIcon className="w-5 h-5 sm:w-7 sm:h-7 text-amber-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 text-sm sm:text-lg truncate">{makeup.group?.name}</h3>
                        {makeup.status === 'IN_PROGRESS' && (
                          <span className="px-1.5 sm:px-2 py-0.5 bg-green-100 text-green-700 text-[10px] sm:text-xs font-semibold rounded-full animate-pulse flex items-center gap-1">
                            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full"></span>
                            În desfășurare
                          </span>
                        )}
                      </div>
                      <span className="text-xs sm:text-sm text-gray-500 block truncate">
                        {makeup.group?.level}
                      </span>
                      <p className="text-xs sm:text-sm text-amber-600 mt-1 font-medium flex items-center gap-1">
                        <CalendarDaysIcon className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="truncate">
                          {new Date(makeup.scheduledAt).toLocaleString('ro-RO', {
                            timeZone: 'UTC',
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </p>
                      {/* Students list */}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {makeup.students?.slice(0, 3).map(ms => (
                          <span 
                            key={ms.id} 
                            className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium rounded-full ${
                              ms.status === 'PRESENT' ? 'bg-green-100 text-green-700' :
                              ms.status === 'ABSENT' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {ms.student?.fullName?.split(' ')[0]}
                          </span>
                        ))}
                        {makeup.students?.length > 3 && (
                          <span className="px-1.5 py-0.5 text-[10px] sm:text-xs text-gray-500">
                            +{makeup.students.length - 3}
                          </span>
                        )}
                        {(!makeup.students || makeup.students.length === 0) && (
                          <span className="text-[10px] sm:text-xs text-gray-400">Niciun elev</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-13 sm:ml-0">
                    <Link
                      href={`/teacher/makeup/${makeup.id}`}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 bg-teal-100 text-teal-700 rounded-lg sm:rounded-xl hover:bg-teal-200 text-xs sm:text-sm font-semibold transition-colors"
                    >
                      <EyeIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span>Deschide</span>
                    </Link>
                    {makeup.status === 'SCHEDULED' && (
                      <button
                        onClick={() => handleCancel(makeup.id)}
                        className="flex items-center justify-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 bg-red-100 text-red-700 rounded-lg sm:rounded-xl hover:bg-red-200 text-xs sm:text-sm font-semibold transition-colors"
                      >
                        <XCircleIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span className="hidden sm:inline">Anulează</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Groups with Absences */}
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-3 sm:px-6 py-3 sm:py-5 border-b border-gray-100 bg-gradient-to-r from-red-50 to-orange-50">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-red-100 rounded-lg">
              <UserGroupIcon className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-sm sm:text-lg font-semibold text-gray-900">Elevi cu Absențe</h2>
              <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">
                Elevii care au absențe și pot beneficia de lecții de recuperare
              </p>
            </div>
          </div>
        </div>

        {groupsWithAbsences.length === 0 ? (
          <div className="p-8 sm:p-16 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <CheckCircleIcon className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" />
            </div>
            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-1">Totul în regulă!</h3>
            <p className="text-xs sm:text-base text-gray-500">Nu există elevi cu absențe de recuperat.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {groupsWithAbsences.map((group) => (
              <div key={group.groupId} className="p-3 sm:p-5">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className="p-1.5 sm:p-2 bg-teal-100 rounded-lg flex-shrink-0">
                      <AcademicCapIcon className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{group.groupName}</h3>
                      <p className="text-xs sm:text-sm text-gray-500 truncate">{group.levelName}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => openModal(group.groupId)}
                    className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-teal-600 text-white rounded-lg sm:rounded-xl hover:bg-teal-700 font-medium transition-colors text-xs sm:text-sm flex-shrink-0"
                  >
                    <PlusIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden xs:inline">Programează</span>
                  </button>
                </div>
                
                {/* Students in this group */}
                <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 sm:ml-10">
                  {group.students.map((gs) => (
                    <div 
                      key={gs.id} 
                      className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-gray-50 rounded-lg sm:rounded-xl"
                    >
                      <div className="relative flex-shrink-0">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center">
                          <span className="text-gray-600 font-semibold text-xs sm:text-sm">
                            {gs.student?.fullName?.charAt(0) || 'E'}
                          </span>
                        </div>
                        <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-red-500 rounded-full flex items-center justify-center ring-2 ring-white">
                          <span className="text-white text-[10px] sm:text-xs font-bold">{gs.absences}</span>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 text-xs sm:text-sm truncate">{gs.student?.fullName}</p>
                        <p className="text-[10px] sm:text-xs text-red-600">
                          {gs.absences} {gs.absences === 1 ? 'absență' : 'absențe'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Sessions History */}
      {completedLessons.length > 0 && (
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 sm:px-6 py-3 sm:py-5 border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg">
                <CheckCircleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-sm sm:text-lg font-semibold text-gray-900">Istoric ({completedLessons.length})</h2>
                <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">
                  Sesiunile de recuperare finalizate cu succes
                </p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {completedLessons.map((makeup) => (
              <div key={makeup.id} className="p-3 sm:p-5 flex items-center justify-between hover:bg-gray-50 transition-colors gap-2">
                <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                  <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center bg-green-100 flex-shrink-0">
                    <CheckCircleIcon className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 text-xs sm:text-base truncate">{makeup.group?.name}</h3>
                    <p className="text-[10px] sm:text-sm text-gray-500 flex items-center gap-1">
                      <CalendarDaysIcon className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="truncate">
                        {new Date(makeup.scheduledAt).toLocaleString('ro-RO', {
                          timeZone: 'UTC',
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1 hidden sm:flex">
                      {makeup.students?.map(ms => (
                        <span 
                          key={ms.id} 
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            ms.status === 'PRESENT' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {ms.student?.fullName?.split(' ')[0]} {ms.status === 'PRESENT' ? '✓' : '✕'}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <Link
                  href={`/teacher/makeup/${makeup.id}`}
                  className="px-2 sm:px-3 py-1 sm:py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-xs sm:text-sm font-medium flex-shrink-0"
                >
                  Detalii
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Makeup Session Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-lg w-full my-4 sm:my-8">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-4 sm:px-6 py-4 sm:py-5 text-white rounded-t-xl sm:rounded-t-2xl">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-white/20 rounded-lg">
                  <CalendarDaysIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold">
                    Programează Recuperare
                  </h3>
                  <p className="text-teal-100 text-xs sm:text-sm">
                    Alege grupa și elevii
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5">
              {/* Group Selection */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-gray-900 mb-1.5 sm:mb-2">
                  Grupa <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.groupId}
                  onChange={(e) => setFormData({ ...formData, groupId: e.target.value, studentIds: [] })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 bg-white text-sm"
                  required
                >
                  <option value="">Selectează grupa</option>
                  {groupsWithAbsences.map(group => (
                    <option key={group.groupId} value={group.groupId}>
                      {group.groupName} ({group.students.length} elevi)
                    </option>
                  ))}
                </select>
              </div>

              {/* Students Selection */}
              {formData.groupId && selectedGroupStudents.length > 0 && (
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-900 mb-1.5 sm:mb-2">
                    Elevi <span className="text-gray-400 font-normal text-xs">(opțional)</span>
                  </label>
                  <div className="space-y-1.5 sm:space-y-2 max-h-32 sm:max-h-40 overflow-y-auto border border-gray-200 rounded-lg sm:rounded-xl p-2 sm:p-3">
                    {selectedGroupStudents.map(gs => (
                      <label 
                        key={gs.studentId} 
                        className={`flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-lg cursor-pointer transition-colors ${
                          formData.studentIds.includes(gs.studentId) ? 'bg-teal-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.studentIds.includes(gs.studentId)}
                          onChange={() => handleStudentToggle(gs.studentId)}
                          className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-xs sm:text-sm truncate">{gs.student?.fullName}</p>
                          <p className="text-[10px] sm:text-xs text-red-600">{gs.absences} absențe</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  {formData.studentIds.length > 0 && (
                    <p className="text-[10px] sm:text-xs text-teal-600 mt-1">
                      {formData.studentIds.length} elevi selectați
                    </p>
                  )}
                </div>
              )}

              {/* Custom Date & Time Picker */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3">
                  Data și Ora <span className="text-red-500">*</span>
                </label>
                
                {/* Calendar */}
                <div className="border border-gray-200 rounded-lg sm:rounded-xl overflow-hidden bg-white">
                  {/* Calendar Header */}
                  <div className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-gray-100">
                    <button
                      type="button"
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                      className="p-1 sm:p-1.5 hover:bg-white rounded-lg transition-colors"
                    >
                      <ChevronLeftIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                    </button>
                    <h4 className="font-semibold text-gray-900 capitalize text-xs sm:text-base">
                      {currentMonth.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' })}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                      className="p-1 sm:p-1.5 hover:bg-white rounded-lg transition-colors"
                    >
                      <ChevronRightIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                    </button>
                  </div>
                  
                  {/* Calendar Grid */}
                  <div className="p-1.5 sm:p-3">
                    {/* Day Headers */}
                    <div className="grid grid-cols-7 mb-1 sm:mb-2">
                      {['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'].map(day => (
                        <div key={day} className="text-center text-[10px] sm:text-xs font-medium text-gray-500 py-1 sm:py-2">
                          {day}
                        </div>
                      ))}
                    </div>
                    
                    {/* Calendar Days */}
                    <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                      {(() => {
                        const year = currentMonth.getFullYear()
                        const month = currentMonth.getMonth()
                        const firstDay = new Date(year, month, 1)
                        const lastDay = new Date(year, month + 1, 0)
                        const startDay = (firstDay.getDay() + 6) % 7 // Monday = 0
                        const days = []
                        const today = new Date()
                        today.setHours(0, 0, 0, 0)
                        
                        // Empty cells before first day
                        for (let i = 0; i < startDay; i++) {
                          days.push(<div key={`empty-${i}`} className="h-7 sm:h-9" />)
                        }
                        
                        // Days of month
                        for (let day = 1; day <= lastDay.getDate(); day++) {
                          const date = new Date(year, month, day)
                          const isToday = date.getTime() === today.getTime()
                          const isPast = date < today
                          const isSelected = selectedDate && 
                            date.getDate() === selectedDate.getDate() && 
                            date.getMonth() === selectedDate.getMonth() && 
                            date.getFullYear() === selectedDate.getFullYear()
                          
                          days.push(
                            <button
                              key={day}
                              type="button"
                              disabled={isPast}
                              onClick={() => setSelectedDate(date)}
                              className={`h-7 sm:h-9 w-full rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all ${
                                isSelected
                                  ? 'bg-teal-600 text-white shadow-sm'
                                  : isToday
                                    ? 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                                    : isPast
                                      ? 'text-gray-300 cursor-not-allowed'
                                      : 'text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              {day}
                            </button>
                          )
                        }
                        
                        return days
                      })()}
                    </div>
                  </div>
                </div>
                
                {/* Time Picker */}
                <div className="mt-3 sm:mt-4 flex items-center gap-2 sm:gap-3">
                  <div className="flex-1">
                    <label className="block text-[10px] sm:text-xs font-medium text-gray-600 mb-1 sm:mb-1.5">Ora</label>
                    <select
                      value={selectedHour}
                      onChange={(e) => setSelectedHour(e.target.value)}
                      className="w-full px-2 sm:px-4 py-2 sm:py-3 border border-gray-200 rounded-lg sm:rounded-xl bg-white text-gray-900 font-medium focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                    >
                      {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] sm:text-xs font-medium text-gray-600 mb-1 sm:mb-1.5">Minute</label>
                    <select
                      value={selectedMinute}
                      onChange={(e) => setSelectedMinute(e.target.value)}
                      className="w-full px-2 sm:px-4 py-2 sm:py-3 border border-gray-200 rounded-lg sm:rounded-xl bg-white text-gray-900 font-medium focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                    >
                      {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {/* Selected DateTime Preview */}
                {selectedDate && (
                  <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-teal-50 border border-teal-100 rounded-lg sm:rounded-xl">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <CalendarDaysIcon className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600 flex-shrink-0" />
                      <span className="text-xs sm:text-sm font-medium text-teal-800">
                        {selectedDate.toLocaleDateString('ro-RO', { 
                          weekday: 'short', 
                          day: 'numeric', 
                          month: 'short'
                        })} la {selectedHour}:{selectedMinute}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Schedule Preview for Selected Day */}
              {selectedDate && daySchedule.length > 0 && (
                <div className="border border-amber-200 rounded-lg sm:rounded-xl overflow-hidden bg-amber-50/50">
                  <div className="px-3 py-2 bg-amber-100/50 border-b border-amber-200">
                    <p className="text-xs sm:text-sm font-medium text-amber-800 flex items-center gap-1.5">
                      <ClockIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Orar pentru {selectedDate.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <div className="p-2 sm:p-3 space-y-2 max-h-48 overflow-y-auto">
                    {daySchedule.map(item => (
                      <div key={item.id} className={`rounded-lg px-3 py-2 border ${
                        item.isMakeup 
                          ? 'bg-amber-50 border-amber-200' 
                          : 'bg-white border-gray-200'
                      }`}>
                        {/* Row 1: Time and Name */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-bold text-sm whitespace-nowrap ${item.isMakeup ? 'text-amber-600' : 'text-indigo-600'}`}>
                            {item.time}
                          </span>
                          {item.isMakeup && (
                            <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          )}
                          <span className="font-medium text-gray-900 text-sm truncate">{item.name}</span>
                          {item.isMakeup && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] shrink-0">Recup.</span>
                          )}
                        </div>
                        {/* Row 2: Location info */}
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          {item.branch && (
                            <span className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              <span className="font-medium text-gray-700">{item.branch}</span>
                            </span>
                          )}
                          {item.locationDetails && (
                            <span className="text-gray-500">• {item.locationDetails}</span>
                          )}
                          {item.teacher && (
                            <span className="text-gray-400 ml-auto truncate">
                              {item.teacher}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Branch and Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-900 mb-1.5 sm:mb-2">
                    Filiala <span className="text-gray-400 font-normal text-xs">(opțional)</span>
                  </label>
                  <select
                    value={formData.branchId}
                    onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 bg-white text-sm"
                  >
                    <option value="">-- Alege filiala --</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name} {branch.address ? `(${branch.address})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-900 mb-1.5 sm:mb-2">
                    Sala / Locație <span className="text-gray-400 font-normal text-xs">(opțional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.locationDetails}
                    onChange={(e) => setFormData({ ...formData, locationDetails: e.target.value })}
                    placeholder="Ex: Sala 3, Etaj 2..."
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 bg-white text-sm"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-gray-900 mb-1.5 sm:mb-2">
                  Notițe <span className="text-gray-400 font-normal text-xs">(opțional)</span>
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 bg-white resize-none transition-all text-sm"
                  placeholder="Ex: Recuperare pentru lecțiile din luna decembrie..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 text-gray-700 bg-gray-100 rounded-lg sm:rounded-xl hover:bg-gray-200 transition-colors font-medium text-sm"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedDate || !formData.groupId}
                  className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-lg sm:rounded-xl hover:from-teal-700 hover:to-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-sm hover:shadow-md text-sm"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Se creează...
                    </span>
                  ) : (
                    'Creează'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
