'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowPathIcon, PlusIcon, XMarkIcon, ChevronLeftIcon, ChevronRightIcon, CalendarIcon, ClockIcon } from '@heroicons/react/24/outline'
import { usePermissions } from '@/hooks/usePermissions'

export default function AdminMakeupPage() {
  const router = useRouter()
  const { hasPermission, isSuperAdmin } = usePermissions()
  
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [activeTab, setActiveTab] = useState('sessions') // sessions, teachers, absences
  const [deleting, setDeleting] = useState(null)
  
  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingLesson, setEditingLesson] = useState(null)
  const [groups, setGroups] = useState([])
  const [teachers, setTeachers] = useState([])
  const [branches, setBranches] = useState([])
  const [groupStudents, setGroupStudents] = useState([])
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [formData, setFormData] = useState({
    groupId: '',
    teacherId: '',
    branchId: '',
    locationDetails: '',
    scheduledAt: '',
    notes: '',
    studentIds: []
  })
  
  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth())
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear())
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('10:00')
  
  // Schedule preview state
  const [daySchedule, setDaySchedule] = useState(null)
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  
  // Helper pentru a extrage ora din scheduleTime JSON pentru o anumită zi
  const getTimeForDay = (scheduleTime, dayOfWeek) => {
    if (!scheduleTime) return '—'
    try {
      const parsed = typeof scheduleTime === 'string' ? JSON.parse(scheduleTime) : scheduleTime
      const time = parsed[dayOfWeek] || '—'
      return `${dayOfWeek} ${time}`
    } catch {
      return scheduleTime // dacă nu e JSON, returnează ca atare
    }
  }
  
  // Verifică permisiunea
  useEffect(() => {
    if (!hasPermission('makeup.view') && !isSuperAdmin) {
      router.push('/admin')
    }
  }, [hasPermission, isSuperAdmin, router])

  useEffect(() => {
    fetchData()
    fetchGroupsAndTeachers()
    fetchBranches()
  }, [])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/admin/makeup')
      const json = await res.json()
      setData(json)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchGroupsAndTeachers = async () => {
    try {
      const [groupsRes, teachersRes] = await Promise.all([
        fetch('/api/admin/groups'),
        fetch('/api/admin/teachers')
      ])
      const groupsData = await groupsRes.json()
      const teachersData = await teachersRes.json()
      // API-ul /api/admin/groups returnează { groups, teachers }, nu un array direct
      setGroups(groupsData?.groups || groupsData || [])
      setTeachers(Array.isArray(teachersData) ? teachersData : [])
    } catch (error) {
      console.error('Error fetching groups/teachers:', error)
    }
  }

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/admin/branches')
      const data = await res.json()
      setBranches(data?.branches || [])
    } catch (error) {
      console.error('Error fetching branches:', error)
    }
  }

  // Fetch schedule for selected date and branch
  const fetchDaySchedule = (date, branchId) => {
    if (!date || !branchId) {
      setDaySchedule(null)
      return
    }
    
    // Get day of week from date - folosim format românesc pentru că așa sunt salvate în DB
    // Parsăm manual data pentru a evita probleme de timezone
    const [year, month, day] = date.split('-').map(Number)
    const dateObj = new Date(year, month - 1, day) // month is 0-indexed
    const dayNamesRo = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă']
    const dayOfWeek = dayNamesRo[dateObj.getDay()]
    
    console.log('fetchDaySchedule:', { date, branchId, dayOfWeek, groupsCount: groups.length })
    
    // Filter groups that have lessons on this day AND belong to selected branch
    let scheduleForDay = groups.filter(group => {
      if (!group.scheduleDays || !Array.isArray(group.scheduleDays)) return false
      if (group.branchId !== branchId) return false
      return group.scheduleDays.includes(dayOfWeek)
    })
    
    console.log('Groups for day:', scheduleForDay.length, scheduleForDay.map(g => ({ name: g.name, scheduleTime: g.scheduleTime })))
    
    // Also get makeup lessons scheduled for this date and branch
    // Only include SCHEDULED or IN_PROGRESS lessons (not completed or canceled)
    const makeupForDay = data?.makeupLessons?.filter(lesson => {
      // Only show active makeup lessons
      if (!['SCHEDULED', 'IN_PROGRESS'].includes(lesson.status)) return false
      
      // Extract date parts from UTC stored date
      const lessonDate = new Date(lesson.scheduledAt)
      const lessonYear = lessonDate.getUTCFullYear()
      const lessonMonth = lessonDate.getUTCMonth() + 1
      const lessonDay = lessonDate.getUTCDate()
      const lessonDateStr = `${lessonYear}-${String(lessonMonth).padStart(2, '0')}-${String(lessonDay).padStart(2, '0')}`
      
      if (lessonDateStr !== date) return false
      if (lesson.branchId !== branchId) return false
      return true
    }) || []
    
    console.log('Makeup for day:', makeupForDay.length, makeupForDay.map(m => ({ id: m.id, group: m.group?.name, location: m.locationDetails })))
    
    // Sort by time
    scheduleForDay = scheduleForDay.sort((a, b) => {
      const timeA = a.scheduleTime || '00:00'
      const timeB = b.scheduleTime || '00:00'
      return timeA.localeCompare(timeB)
    })
    
    setDaySchedule({ groups: scheduleForDay, makeups: makeupForDay, dayOfWeek })
  }

  const fetchGroupStudents = async (groupId) => {
    if (!groupId) {
      setGroupStudents([])
      return
    }
    try {
      const res = await fetch(`/api/admin/groups/${groupId}`)
      const group = await res.json()
      setGroupStudents(group.groupStudents || [])
    } catch (error) {
      console.error('Error fetching group students:', error)
    }
  }

  const handleGroupChange = (groupId) => {
    setFormData({ ...formData, groupId, studentIds: [] })
    fetchGroupStudents(groupId)
  }

  const toggleStudent = (studentId) => {
    setFormData(prev => ({
      ...prev,
      studentIds: prev.studentIds.includes(studentId)
        ? prev.studentIds.filter(id => id !== studentId)
        : [...prev.studentIds, studentId]
    }))
  }

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    if (!formData.groupId || !formData.teacherId || !formData.scheduledAt) {
      alert('Te rog completează toate câmpurile obligatorii')
      return
    }
    
    setCreating(true)
    try {
      const res = await fetch('/api/admin/makeup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      
      if (res.ok) {
        setShowCreateModal(false)
        setFormData({ groupId: '', teacherId: '', branchId: '', locationDetails: '', scheduledAt: '', notes: '', studentIds: [] })
        setGroupStudents([])
        setDaySchedule(null)
        setSelectedDate('')
        fetchData()
      } else {
        const error = await res.json()
        alert(error.error || 'Eroare la crearea sesiunii')
      }
    } catch (error) {
      console.error('Error creating makeup lesson:', error)
      alert('Eroare la crearea sesiunii')
    } finally {
      setCreating(false)
    }
  }

  const openEditModal = async (lesson) => {
    setEditingLesson(lesson)
    
    // Format date for the picker
    const scheduledDate = new Date(lesson.scheduledAt)
    const dateStr = `${scheduledDate.getFullYear()}-${String(scheduledDate.getMonth() + 1).padStart(2, '0')}-${String(scheduledDate.getDate()).padStart(2, '0')}`
    const timeStr = `${String(scheduledDate.getHours()).padStart(2, '0')}:${String(scheduledDate.getMinutes()).padStart(2, '0')}`
    
    setFormData({
      groupId: lesson.groupId,
      teacherId: lesson.teacherId,
      branchId: lesson.branchId || '',
      locationDetails: lesson.locationDetails || '',
      scheduledAt: `${dateStr}T${timeStr}`,
      notes: lesson.notes || '',
      studentIds: lesson.students?.map(s => s.studentId) || []
    })
    
    setSelectedDate(dateStr)
    setSelectedTime(timeStr)
    setPickerMonth(scheduledDate.getMonth())
    setPickerYear(scheduledDate.getFullYear())
    
    // Fetch group students for this lesson's group
    await fetchGroupStudents(lesson.groupId)
    
    // Fetch schedule for this date and branch
    fetchDaySchedule(dateStr, lesson.branchId || '')
    
    setShowEditModal(true)
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!formData.groupId || !formData.teacherId || !formData.scheduledAt) {
      alert('Te rog completează toate câmpurile obligatorii')
      return
    }
    
    setUpdating(true)
    try {
      const res = await fetch(`/api/admin/makeup/${editingLesson.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      
      if (res.ok) {
        setShowEditModal(false)
        setEditingLesson(null)
        setFormData({ groupId: '', teacherId: '', branchId: '', locationDetails: '', scheduledAt: '', notes: '', studentIds: [] })
        setGroupStudents([])
        setDaySchedule(null)
        setSelectedDate('')
        fetchData()
      } else {
        const error = await res.json()
        alert(error.error || 'Eroare la actualizarea sesiunii')
      }
    } catch (error) {
      console.error('Error updating makeup lesson:', error)
      alert('Eroare la actualizarea sesiunii')
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Ești sigur că vrei să ștergi această sesiune de recuperare?')) return
    
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/makeup/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchData()
      } else {
        alert('Eroare la ștergerea sesiunii')
      }
    } catch (error) {
      console.error('Error deleting:', error)
      alert('Eroare la ștergerea sesiunii')
    } finally {
      setDeleting(null)
    }
  }

  const filteredLessons = data?.makeupLessons?.filter(lesson => {
    if (selectedTeacher && lesson.teacherId !== selectedTeacher) return false
    if (selectedStatus && lesson.status !== selectedStatus) return false
    return true
  }) || []

  // Calendar helpers
  const monthNames = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie']
  const dayNames = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du']
  
  const getDaysInMonth = (month, year) => new Date(year, month + 1, 0).getDate()
  const getFirstDayOfMonth = (month, year) => {
    const day = new Date(year, month, 1).getDay()
    return day === 0 ? 6 : day - 1 // Convert to Monday = 0
  }
  
  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(pickerMonth, pickerYear)
    const firstDay = getFirstDayOfMonth(pickerMonth, pickerYear)
    const days = []
    
    // Empty cells for days before first day
    for (let i = 0; i < firstDay; i++) {
      days.push(null)
    }
    
    // Days of month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i)
    }
    
    return days
  }
  
  const handleDateSelect = (day) => {
    if (!day) return
    const dateStr = `${pickerYear}-${String(pickerMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    setSelectedDate(dateStr)
    setFormData(prev => ({ ...prev, scheduledAt: `${dateStr}T${selectedTime}` }))
    // Fetch schedule for this date and current branch
    fetchDaySchedule(dateStr, formData.branchId)
  }
  
  const handleBranchChange = (branchId) => {
    setFormData(prev => ({ ...prev, branchId }))
    // Update schedule if date is already selected
    if (selectedDate) {
      fetchDaySchedule(selectedDate, branchId)
    }
  }
  
  const handleTimeSelect = (time) => {
    setSelectedTime(time)
    if (selectedDate) {
      setFormData(prev => ({ ...prev, scheduledAt: `${selectedDate}T${time}` }))
    }
  }
  
  const isToday = (day) => {
    const today = new Date()
    return day === today.getDate() && pickerMonth === today.getMonth() && pickerYear === today.getFullYear()
  }
  
  const isSelected = (day) => {
    if (!selectedDate || !day) return false
    const [y, m, d] = selectedDate.split('-').map(Number)
    return day === d && pickerMonth === m - 1 && pickerYear === y
  }
  
  const isPastDay = (day) => {
    if (!day) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const checkDate = new Date(pickerYear, pickerMonth, day)
    return checkDate < today
  }

  const timeSlots = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
    '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
    '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
    '20:00', '20:30', '21:00'
  ]

  const getStatusBadge = (status) => {
    const styles = {
      SCHEDULED: 'bg-blue-100 text-blue-700',
      IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
      COMPLETED: 'bg-green-100 text-green-700',
      CANCELED: 'bg-red-100 text-red-700'
    }
    const labels = {
      SCHEDULED: 'Programată',
      IN_PROGRESS: 'În desfășurare',
      COMPLETED: 'Finalizată',
      CANCELED: 'Anulată'
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
        {labels[status] || status}
      </span>
    )
  }

  const getAttendanceBadge = (status) => {
    const styles = {
      PENDING: 'bg-gray-100 text-gray-600',
      PRESENT: 'bg-green-100 text-green-700',
      ABSENT: 'bg-red-100 text-red-700'
    }
    const labels = {
      PENDING: 'În așteptare',
      PRESENT: 'Prezent',
      ABSENT: 'Absent'
    }
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>
        {labels[status] || status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4 xs:space-y-6">
      {/* Header */}
      <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4">
        <div>
          <h1 className="text-xl xs:text-2xl font-bold text-gray-900">Sesiuni de Recuperare</h1>
          <p className="text-sm xs:text-base text-gray-600 mt-0.5 xs:mt-1">Gestionează toate sesiunile de recuperare</p>
        </div>
        {(hasPermission('makeup.create') || isSuperAdmin) && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center justify-center gap-1.5 xs:gap-2 px-3 xs:px-4 py-2 xs:py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm xs:text-base font-medium shadow-sm"
          >
            <PlusIcon className="w-4 h-4 xs:w-5 xs:h-5" />
            <span className="hidden xs:inline">Creează Sesiune Nouă</span>
            <span className="xs:hidden">Creă Sesiune</span>
          </button>
        )}
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 xs:gap-3 md:gap-4">
        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 border border-gray-200 shadow-sm">
          <p className="text-[10px] xs:text-xs text-gray-500 uppercase tracking-wide truncate">Total Sesiuni</p>
          <p className="text-lg xs:text-xl md:text-2xl font-bold text-gray-900 mt-0.5 xs:mt-1">{data?.overallStats?.totalMakeupLessons || 0}</p>
        </div>
        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 border border-gray-200 shadow-sm">
          <p className="text-[10px] xs:text-xs text-gray-500 uppercase tracking-wide truncate">Programate</p>
          <p className="text-lg xs:text-xl md:text-2xl font-bold text-blue-600 mt-0.5 xs:mt-1">{data?.overallStats?.scheduledLessons || 0}</p>
        </div>
        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 border border-gray-200 shadow-sm">
          <p className="text-[10px] xs:text-xs text-gray-500 uppercase tracking-wide truncate">În Desfășurare</p>
          <p className="text-lg xs:text-xl md:text-2xl font-bold text-yellow-600 mt-0.5 xs:mt-1">{data?.overallStats?.inProgressLessons || 0}</p>
        </div>
        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 border border-gray-200 shadow-sm">
          <p className="text-[10px] xs:text-xs text-gray-500 uppercase tracking-wide truncate">Finalizate</p>
          <p className="text-lg xs:text-xl md:text-2xl font-bold text-green-600 mt-0.5 xs:mt-1">{data?.overallStats?.completedLessons || 0}</p>
        </div>
        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 border border-gray-200 shadow-sm">
          <p className="text-[10px] xs:text-xs text-gray-500 uppercase tracking-wide truncate">Elevi cu Absențe</p>
          <p className="text-lg xs:text-xl md:text-2xl font-bold text-orange-600 mt-0.5 xs:mt-1">{data?.overallStats?.totalStudentsWithAbsences || 0}</p>
        </div>
        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 border border-gray-200 shadow-sm">
          <p className="text-[10px] xs:text-xs text-gray-500 uppercase tracking-wide truncate">Ore de Recuperat</p>
          <p className="text-lg xs:text-xl md:text-2xl font-bold text-red-600 mt-0.5 xs:mt-1">{data?.overallStats?.totalAbsencesToRecover || 0}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 -mx-3 xs:mx-0 px-3 xs:px-0 overflow-x-auto">
        <nav className="-mb-px flex gap-2 xs:gap-4 min-w-max xs:min-w-0">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`py-2.5 xs:py-3 px-2 xs:px-1 border-b-2 font-medium text-xs xs:text-sm transition-colors whitespace-nowrap ${
              activeTab === 'sessions'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span className="hidden xs:inline">Toate Sesiunile</span>
            <span className="xs:hidden">Sesiuni</span>
          </button>
          <button
            onClick={() => setActiveTab('teachers')}
            className={`py-2.5 xs:py-3 px-2 xs:px-1 border-b-2 font-medium text-xs xs:text-sm transition-colors whitespace-nowrap ${
              activeTab === 'teachers'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span className="hidden xs:inline">Statistici Profesori</span>
            <span className="xs:hidden">Profesori</span>
          </button>
          <button
            onClick={() => setActiveTab('absences')}
            className={`py-2.5 xs:py-3 px-2 xs:px-1 border-b-2 font-medium text-xs xs:text-sm transition-colors whitespace-nowrap ${
              activeTab === 'absences'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span className="hidden xs:inline">Absențe de Recuperat</span>
            <span className="xs:hidden">Absențe</span>
          </button>
        </nav>
      </div>

      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div className="space-y-3 xs:space-y-4">
          {/* Filters */}
          <div className="flex flex-col xs:flex-row xs:flex-wrap gap-2 xs:gap-4 bg-white rounded-lg xs:rounded-xl p-3 xs:p-4 border border-gray-200">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] xs:text-xs font-medium text-gray-700 mb-1">Profesor</label>
              <select
                value={selectedTeacher}
                onChange={(e) => setSelectedTeacher(e.target.value)}
                className="w-full px-2 xs:px-3 py-1.5 xs:py-2 border border-gray-300 rounded-lg text-xs xs:text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Toți profesorii</option>
                {data?.teacherStats?.map(teacher => (
                  <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] xs:text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-2 xs:px-3 py-1.5 xs:py-2 border border-gray-300 rounded-lg text-xs xs:text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Toate statusurile</option>
                <option value="SCHEDULED">Programate</option>
                <option value="IN_PROGRESS">În desfășurare</option>
                <option value="COMPLETED">Finalizate</option>
                <option value="CANCELED">Anulate</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => { setSelectedTeacher(''); setSelectedStatus(''); }}
                className="px-2 xs:px-3 py-1.5 xs:py-2 text-xs xs:text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap"
              >
                Resetează filtrele
              </button>
            </div>
          </div>

          {/* Sessions List */}
          <div className="space-y-4">
            {filteredLessons.length === 0 ? (
              <div className="bg-white rounded-xl p-8 border border-gray-200 text-center">
                <p className="text-gray-500">Nu există sesiuni de recuperare</p>
              </div>
            ) : (
              filteredLessons.map(lesson => (
                <div key={lesson.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden border-l-4 border-l-purple-500">
                  {/* Header */}
                  <div className="p-4 border-b border-gray-100 bg-gray-50">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-bold rounded uppercase tracking-wide flex items-center gap-1">
                            <ArrowPathIcon className="w-3.5 h-3.5" />
                            Recuperare
                          </span>
                          <h3 className="font-semibold text-gray-900">{lesson.group?.level}</h3>
                          {getStatusBadge(lesson.status)}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          Grupa originală: {lesson.group?.name} • Profesor: <span className="font-medium">{lesson.teacher?.name}</span>
                        </p>
                        <p className="text-sm text-gray-500 mt-0.5">
                          Programat: {new Date(lesson.scheduledAt).toLocaleString('ro-RO', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'UTC'
                          })}
                        </p>
                        {(lesson.branch || lesson.locationDetails) && (
                          <p className="text-sm text-gray-500 mt-0.5">
                            Locație: {lesson.branch?.name || ''}{lesson.branch && lesson.locationDetails ? ' - ' : ''}{lesson.locationDetails || ''}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          Creat: {new Date(lesson.createdAt).toLocaleString('ro-RO')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {(hasPermission('makeup.edit') || isSuperAdmin) && (
                          <button
                            onClick={() => openEditModal(lesson)}
                            className="px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            Editează
                          </button>
                        )}
                        {(hasPermission('makeup.delete') || isSuperAdmin) && (
                          <button
                            onClick={() => handleDelete(lesson.id)}
                            disabled={deleting === lesson.id}
                            className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {deleting === lesson.id ? 'Se șterge...' : 'Șterge'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  {lesson.notes && (
                    <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
                      <p className="text-sm text-amber-800">
                        <span className="font-medium">Notițe sesiune:</span> {lesson.notes}
                      </p>
                    </div>
                  )}

                  {/* Students */}
                  <div className="p-4">
                    <p className="text-sm font-medium text-gray-700 mb-3">
                      Elevi ({lesson.students?.length || 0}):
                    </p>
                    {lesson.students?.length > 0 ? (
                      <div className="space-y-2">
                        {lesson.students.map(ms => (
                          <div key={ms.id} className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                                <span className="text-sm font-medium text-indigo-600">
                                  {ms.student?.fullName?.charAt(0) || '?'}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">{ms.student?.fullName}</p>
                                {ms.notes && (
                                  <p className="text-xs text-gray-500 mt-0.5">📝 {ms.notes}</p>
                                )}
                              </div>
                            </div>
                            {getAttendanceBadge(ms.status)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">Niciun elev adăugat</p>
                    )}
                  </div>

                  {/* Summary for completed sessions */}
                  {lesson.status === 'COMPLETED' && (
                    <div className="px-4 py-3 bg-green-50 border-t border-green-100">
                      <div className="flex flex-wrap gap-4 text-sm">
                        <span className="text-green-700">
                          ✅ Prezenți: {lesson.students?.filter(s => s.status === 'PRESENT').length || 0}
                        </span>
                        <span className="text-red-600">
                          ❌ Absenți: {lesson.students?.filter(s => s.status === 'ABSENT').length || 0}
                        </span>
                        {lesson.lessonsDeducted && (
                          <span className="text-green-600 font-medium">
                            • Ore recuperate scăzute din absențe
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Teachers Tab */}
      {activeTab === 'teachers' && (
        <div className="space-y-4">
          {data?.teacherStats?.length === 0 ? (
            <div className="bg-white rounded-xl p-8 border border-gray-200 text-center">
              <p className="text-gray-500">Niciun profesor nu a creat sesiuni de recuperare</p>
            </div>
          ) : (
            data?.teacherStats?.map(teacher => (
              <div key={teacher.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                      <span className="text-lg font-bold text-white">
                        {teacher.name?.charAt(0) || '?'}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{teacher.name}</h3>
                      <p className="text-sm text-gray-500">{teacher.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedTeacher(teacher.id)
                      setActiveTab('sessions')
                    }}
                    className="px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  >
                    Vezi sesiunile →
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Total Sesiuni</p>
                    <p className="text-xl font-bold text-gray-900">{teacher.stats.total}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-blue-600">Programate</p>
                    <p className="text-xl font-bold text-blue-700">{teacher.stats.scheduled}</p>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-yellow-600">În Desfășurare</p>
                    <p className="text-xl font-bold text-yellow-700">{teacher.stats.inProgress}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-green-600">Finalizate</p>
                    <p className="text-xl font-bold text-green-700">{teacher.stats.completed}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-emerald-600">Elevi Recuperați</p>
                    <p className="text-xl font-bold text-emerald-700">{teacher.stats.studentsMarkedPresent}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-red-600">Elevi Absenți</p>
                    <p className="text-xl font-bold text-red-700">{teacher.stats.studentsMarkedAbsent}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Absences Tab */}
      {activeTab === 'absences' && (
        <div className="space-y-4">
          {data?.studentsWithAbsences?.length === 0 ? (
            <div className="bg-white rounded-xl p-8 border border-gray-200 text-center">
              <p className="text-gray-500">Nu există elevi cu absențe de recuperat</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Elev</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Grupă</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Nivel</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Profesor</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Absențe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.studentsWithAbsences.map((gs, idx) => (
                      <tr key={`${gs.groupId}-${gs.studentId}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-medium text-indigo-600">
                                {gs.student?.fullName?.charAt(0) || '?'}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{gs.student?.fullName}</p>
                              <p className="text-xs text-gray-500">{gs.student?.parentEmail || gs.student?.parentPhone || ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{gs.group?.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{gs.group?.level}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{gs.group?.teacher?.name || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-full text-sm font-bold ${
                            gs.absences >= 3 ? 'bg-red-100 text-red-700' : 
                            gs.absences >= 2 ? 'bg-orange-100 text-orange-700' : 
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {gs.absences}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 xs:p-4">
          <div className="bg-white rounded-xl xs:rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] xs:max-h-[90vh] overflow-y-auto">
            <div className="p-3 xs:p-4 md:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base xs:text-lg md:text-xl font-bold text-gray-900 truncate">Creează Sesiune de Recuperare</h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false)
                    setFormData({ groupId: '', teacherId: '', branchId: '', locationDetails: '', scheduledAt: '', notes: '', studentIds: [] })
                    setGroupStudents([])
                    setDaySchedule(null)
                    setSelectedDate('')
                  }}
                  className="p-1.5 xs:p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                >
                  <XMarkIcon className="w-4 h-4 xs:w-5 xs:h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-3 xs:p-4 md:p-6 space-y-3 xs:space-y-4 md:space-y-5">
              {/* Group Selection */}
              <div>
                <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                  Grupă <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.groupId}
                  onChange={(e) => handleGroupChange(e.target.value)}
                  className="w-full px-3 xs:px-4 py-2 xs:py-2.5 text-sm xs:text-base border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="">Selectează grupa</option>
                  {groups.map(group => (
                    <option key={group.id} value={group.id}>
                      {group.name} - {group.level}
                    </option>
                  ))}
                </select>
              </div>

              {/* Teacher Selection */}
              <div>
                <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                  Profesor <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.teacherId}
                  onChange={(e) => setFormData({ ...formData, teacherId: e.target.value })}
                  className="w-full px-3 xs:px-4 py-2 xs:py-2.5 text-sm xs:text-base border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="">Selectează profesorul</option>
                  {teachers.map(teacher => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name} ({teacher.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Branch Selection */}
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 xs:gap-4">
                <div>
                  <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                    Filială (opțional)
                  </label>
                  <select
                    value={formData.branchId}
                    onChange={(e) => handleBranchChange(e.target.value)}
                    className="w-full px-3 xs:px-4 py-2 xs:py-2.5 text-sm xs:text-base border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Toate filialele</option>
                    {branches.filter(b => b.active).map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                    Sala (opțional)
                  </label>
                  <input
                    type="text"
                    value={formData.locationDetails}
                    onChange={(e) => setFormData({ ...formData, locationDetails: e.target.value })}
                    placeholder="Ex: Sala 3, Meet link, etc."
                    className="w-full px-3 xs:px-4 py-2 xs:py-2.5 text-sm xs:text-base border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Schedule Preview for Selected Day */}
              {selectedDate && formData.branchId && daySchedule && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1.5">
                    <CalendarIcon className="w-4 h-4" />
                    Orar - {branches.find(b => b.id === formData.branchId)?.name || ''}
                  </p>
                  {(daySchedule.groups?.length > 0 || daySchedule.makeups?.length > 0) ? (
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {daySchedule.groups?.map(group => (
                        <div key={group.id} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1.5 border border-blue-100">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-700">{getTimeForDay(group.scheduleTime, daySchedule.dayOfWeek)}</span>
                            <span className="text-gray-600">{group.name}</span>
                          </div>
                          <span className="text-gray-500">{group.locationDetails || ''}</span>
                        </div>
                      ))}
                      {daySchedule.makeups?.map(makeup => (
                        <div key={makeup.id} className="flex items-center justify-between text-xs bg-purple-50 rounded px-2 py-1.5 border border-purple-200">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-purple-700">
                              {new Date(makeup.scheduledAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
                            </span>
                            <span className="text-purple-600">Recuperare: {makeup.group?.name}</span>
                          </div>
                          <span className="text-purple-500">{makeup.locationDetails || ''}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-blue-600 italic">Nu există ore programate în această zi{formData.branchId ? ' la această filială' : ''}</p>
                  )}
                </div>
              )}

              {/* Date & Time - Compact Picker */}
              <div>
                <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                  Data și Ora <span className="text-red-500">*</span>
                </label>
                
                {/* Trigger Button */}
                <button
                  type="button"
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className={`w-full px-2.5 xs:px-3 py-2 xs:py-2.5 border rounded-lg text-left flex items-center justify-between transition-all text-xs xs:text-sm ${
                    formData.scheduledAt 
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700' 
                      : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400'
                  }`}
                >
                  <div className="flex items-center gap-1.5 xs:gap-2 min-w-0">
                    <CalendarIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 flex-shrink-0" />
                    {formData.scheduledAt ? (
                      <span className="font-medium truncate">
                        {new Date(formData.scheduledAt).toLocaleString('ro-RO', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    ) : (
                      <span className="truncate">Alege data și ora</span>
                    )}
                  </div>
                  <ChevronRightIcon className={`w-3.5 h-3.5 xs:w-4 xs:h-4 transition-transform flex-shrink-0 ${showDatePicker ? 'rotate-90' : ''}`} />
                </button>

                {/* Compact Date/Time Picker */}
                {showDatePicker && (
                  <div className="mt-2 p-3 border border-gray-200 rounded-lg bg-white shadow-lg">
                    <div className="flex gap-3">
                      {/* Calendar Side */}
                      <div className="flex-1">
                        {/* Month Navigation */}
                        <div className="flex items-center justify-between mb-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (pickerMonth === 0) { setPickerMonth(11); setPickerYear(pickerYear - 1) }
                              else { setPickerMonth(pickerMonth - 1) }
                            }}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
                          </button>
                          <span className="text-sm font-semibold text-gray-900">
                            {monthNames[pickerMonth].slice(0, 3)} {pickerYear}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (pickerMonth === 11) { setPickerMonth(0); setPickerYear(pickerYear + 1) }
                              else { setPickerMonth(pickerMonth + 1) }
                            }}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <ChevronRightIcon className="w-4 h-4 text-gray-600" />
                          </button>
                        </div>

                        {/* Days Header */}
                        <div className="grid grid-cols-7 gap-0.5 mb-1">
                          {dayNames.map(day => (
                            <div key={day} className="text-center text-[10px] font-medium text-gray-400 py-0.5">
                              {day}
                            </div>
                          ))}
                        </div>

                        {/* Days Grid */}
                        <div className="grid grid-cols-7 gap-0.5">
                          {generateCalendarDays().map((day, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleDateSelect(day)}
                              disabled={!day || isPastDay(day)}
                              className={`
                                w-7 h-7 rounded text-xs font-medium transition-all
                                ${!day ? 'invisible' : ''}
                                ${isPastDay(day) ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-indigo-100'}
                                ${isToday(day) && !isSelected(day) ? 'bg-gray-100' : ''}
                                ${isSelected(day) ? 'bg-indigo-600 text-white' : 'text-gray-700'}
                              `}
                            >
                              {day}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Time Side */}
                      <div className="w-20 border-l border-gray-200 pl-3">
                        <div className="text-[10px] font-medium text-gray-400 mb-1 flex items-center gap-1">
                          <ClockIcon className="w-3 h-3" /> ORA
                        </div>
                        <input
                          type="text"
                          value={selectedTime}
                          onChange={(e) => handleTimeSelect(e.target.value)}
                          placeholder="HH:MM"
                          pattern="[0-9]{2}:[0-9]{2}"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        />
                      </div>
                    </div>

                    {/* Quick Confirm */}
                    {selectedDate && selectedTime && (
                      <button
                        type="button"
                        onClick={() => setShowDatePicker(false)}
                        className="w-full mt-2 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 flex items-center justify-center gap-1"
                      >
                        ✓ Confirmat
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                  Notițe (opțional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Adaugă informații suplimentare..."
                  className="w-full px-3 xs:px-4 py-2 xs:py-2.5 text-sm xs:text-base border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  rows={3}
                />
              </div>

              {/* Students Selection */}
              {formData.groupId && (
                <div>
                  <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1.5 xs:mb-2">
                    Elevi pentru recuperare
                  </label>
                  {groupStudents.length === 0 ? (
                    <p className="text-xs xs:text-sm text-gray-500 italic p-2.5 xs:p-3 bg-gray-50 rounded-lg">
                      Nu există elevi în această grupă
                    </p>
                  ) : (
                    <div className="border border-gray-200 rounded-lg max-h-48 xs:max-h-60 overflow-y-auto">
                      {groupStudents.map(gs => (
                        <label
                          key={gs.id}
                          className="flex items-center gap-2 xs:gap-3 p-2 xs:p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={formData.studentIds.includes(gs.studentId)}
                            onChange={() => toggleStudent(gs.studentId)}
                            className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-xs xs:text-sm truncate">{gs.student?.fullName}</p>
                            <p className="text-[10px] xs:text-xs text-gray-500">
                              Lecții: {gs.lessonsRemaining} • Absențe: {gs.absences}
                            </p>
                          </div>
                          {gs.absences > 0 && (
                            <span className="px-1.5 xs:px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] xs:text-xs font-medium rounded-full flex-shrink-0">
                              {gs.absences}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                  {formData.studentIds.length > 0 && (
                    <p className="mt-1.5 xs:mt-2 text-xs xs:text-sm text-indigo-600">
                      {formData.studentIds.length} elev(i) selectat(i)
                    </p>
                  )}
                </div>
              )}

              {/* Submit */}
              <div className="flex flex-col xs:flex-row justify-end gap-2 xs:gap-3 pt-3 xs:pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false)
                    setFormData({ groupId: '', teacherId: '', branchId: '', locationDetails: '', scheduledAt: '', notes: '', studentIds: [] })
                    setGroupStudents([])
                    setDaySchedule(null)
                    setSelectedDate('')
                  }}
                  className="px-3 xs:px-4 py-2 text-sm xs:text-base text-gray-700 hover:bg-gray-100 rounded-lg transition-colors order-2 xs:order-1"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 xs:px-6 py-2 text-sm xs:text-base bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 xs:gap-2 order-1 xs:order-2"
                >
                  {creating ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 xs:h-4 xs:w-4 border-2 border-white border-t-transparent"></div>
                      <span className="hidden xs:inline">Se creează...</span>
                      <span className="xs:hidden">Creează...</span>
                    </>
                  ) : (
                    <>
                      <PlusIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4" />
                      Creează Sesiune
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingLesson && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 xs:p-4">
          <div className="bg-white rounded-xl xs:rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] xs:max-h-[90vh] overflow-y-auto">
            <div className="p-3 xs:p-4 md:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base xs:text-lg md:text-xl font-bold text-gray-900 truncate">Editează Sesiune de Recuperare</h2>
                <button
                  onClick={() => {
                    setShowEditModal(false)
                    setEditingLesson(null)
                    setFormData({ groupId: '', teacherId: '', branchId: '', locationDetails: '', scheduledAt: '', notes: '', studentIds: [] })
                    setGroupStudents([])
                    setDaySchedule(null)
                    setSelectedDate('')
                  }}
                  className="p-1.5 xs:p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                >
                  <XMarkIcon className="w-4 h-4 xs:w-5 xs:h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <form onSubmit={handleEditSubmit} className="p-3 xs:p-4 md:p-6 space-y-3 xs:space-y-4 md:space-y-5">
              {/* Group Selection */}
              <div>
                <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                  Grupă <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.groupId}
                  onChange={(e) => handleGroupChange(e.target.value)}
                  className="w-full px-3 xs:px-4 py-2 xs:py-2.5 text-sm xs:text-base border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="">Selectează grupa</option>
                  {groups.map(group => (
                    <option key={group.id} value={group.id}>
                      {group.name} - {group.level}
                    </option>
                  ))}
                </select>
              </div>

              {/* Teacher Selection */}
              <div>
                <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                  Profesor <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.teacherId}
                  onChange={(e) => setFormData({ ...formData, teacherId: e.target.value })}
                  className="w-full px-3 xs:px-4 py-2 xs:py-2.5 text-sm xs:text-base border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="">Selectează profesorul</option>
                  {teachers.map(teacher => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name} ({teacher.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Branch Selection */}
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 xs:gap-4">
                <div>
                  <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                    Filială (opțional)
                  </label>
                  <select
                    value={formData.branchId}
                    onChange={(e) => handleBranchChange(e.target.value)}
                    className="w-full px-3 xs:px-4 py-2 xs:py-2.5 text-sm xs:text-base border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Toate filialele</option>
                    {branches.filter(b => b.active).map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                    Sala (opțional)
                  </label>
                  <input
                    type="text"
                    value={formData.locationDetails}
                    onChange={(e) => setFormData({ ...formData, locationDetails: e.target.value })}
                    placeholder="Ex: Sala 3, Meet link, etc."
                    className="w-full px-3 xs:px-4 py-2 xs:py-2.5 text-sm xs:text-base border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Schedule Preview for Selected Day */}
              {selectedDate && formData.branchId && daySchedule && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1.5">
                    <CalendarIcon className="w-4 h-4" />
                    Orar - {branches.find(b => b.id === formData.branchId)?.name || ''}
                  </p>
                  {(daySchedule.groups?.length > 0 || daySchedule.makeups?.filter(m => m.id !== editingLesson?.id).length > 0) ? (
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {daySchedule.groups?.map(group => (
                        <div key={group.id} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1.5 border border-blue-100">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-700">{getTimeForDay(group.scheduleTime, daySchedule.dayOfWeek)}</span>
                            <span className="text-gray-600">{group.name}</span>
                          </div>
                          <span className="text-gray-500">{group.locationDetails || ''}</span>
                        </div>
                      ))}
                      {daySchedule.makeups?.filter(m => m.id !== editingLesson?.id).map(makeup => (
                        <div key={makeup.id} className="flex items-center justify-between text-xs bg-purple-50 rounded px-2 py-1.5 border border-purple-200">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-purple-700">
                              {new Date(makeup.scheduledAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
                            </span>
                            <span className="text-purple-600">Recuperare: {makeup.group?.name}</span>
                          </div>
                          <span className="text-purple-500">{makeup.locationDetails || ''}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-blue-600 italic">Nu există ore programate în această zi{formData.branchId ? ' la această filială' : ''}</p>
                  )}
                </div>
              )}

              {/* Date & Time - Compact Picker */}
              <div>
                <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                  Data și Ora <span className="text-red-500">*</span>
                </label>
                
                {/* Trigger Button */}
                <button
                  type="button"
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className={`w-full px-2.5 xs:px-3 py-2 xs:py-2.5 border rounded-lg text-left flex items-center justify-between transition-all text-xs xs:text-sm ${
                    formData.scheduledAt 
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700' 
                      : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400'
                  }`}
                >
                  <div className="flex items-center gap-1.5 xs:gap-2 min-w-0">
                    <CalendarIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 flex-shrink-0" />
                    {formData.scheduledAt ? (
                      <span className="font-medium truncate">
                        {new Date(formData.scheduledAt).toLocaleString('ro-RO', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    ) : (
                      <span className="truncate">Alege data și ora</span>
                    )}
                  </div>
                  <ChevronRightIcon className={`w-3.5 h-3.5 xs:w-4 xs:h-4 transition-transform flex-shrink-0 ${showDatePicker ? 'rotate-90' : ''}`} />
                </button>

                {/* Compact Date/Time Picker */}
                {showDatePicker && (
                  <div className="mt-2 p-3 border border-gray-200 rounded-lg bg-white shadow-lg">
                    <div className="flex gap-3">
                      {/* Calendar Side */}
                      <div className="flex-1">
                        {/* Month Navigation */}
                        <div className="flex items-center justify-between mb-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (pickerMonth === 0) { setPickerMonth(11); setPickerYear(pickerYear - 1) }
                              else { setPickerMonth(pickerMonth - 1) }
                            }}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
                          </button>
                          <span className="text-sm font-semibold text-gray-900">
                            {monthNames[pickerMonth].slice(0, 3)} {pickerYear}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (pickerMonth === 11) { setPickerMonth(0); setPickerYear(pickerYear + 1) }
                              else { setPickerMonth(pickerMonth + 1) }
                            }}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <ChevronRightIcon className="w-4 h-4 text-gray-600" />
                          </button>
                        </div>

                        {/* Days Header */}
                        <div className="grid grid-cols-7 gap-0.5 mb-1">
                          {dayNames.map(day => (
                            <div key={day} className="text-center text-[10px] font-medium text-gray-400 py-0.5">
                              {day}
                            </div>
                          ))}
                        </div>

                        {/* Days Grid */}
                        <div className="grid grid-cols-7 gap-0.5">
                          {generateCalendarDays().map((day, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleDateSelect(day)}
                              disabled={!day}
                              className={`
                                w-7 h-7 rounded text-xs font-medium transition-all
                                ${!day ? 'invisible' : ''}
                                ${isToday(day) && !isSelected(day) ? 'bg-gray-100' : ''}
                                ${isSelected(day) ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-indigo-100'}
                              `}
                            >
                              {day}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Time Side */}
                      <div className="w-20 border-l border-gray-200 pl-3">
                        <div className="text-[10px] font-medium text-gray-400 mb-1 flex items-center gap-1">
                          <ClockIcon className="w-3 h-3" /> ORA
                        </div>
                        <input
                          type="text"
                          value={selectedTime}
                          onChange={(e) => handleTimeSelect(e.target.value)}
                          placeholder="HH:MM"
                          pattern="[0-9]{2}:[0-9]{2}"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        />
                      </div>
                    </div>

                    {/* Quick Confirm */}
                    {selectedDate && selectedTime && (
                      <button
                        type="button"
                        onClick={() => setShowDatePicker(false)}
                        className="w-full mt-2 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 flex items-center justify-center gap-1"
                      >
                        ✓ Confirmat
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                  Notițe (opțional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Adaugă informații suplimentare..."
                  className="w-full px-3 xs:px-4 py-2 xs:py-2.5 text-sm xs:text-base border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  rows={3}
                />
              </div>

              {/* Students Selection */}
              {formData.groupId && (
                <div>
                  <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1.5 xs:mb-2">
                    Elevi pentru recuperare
                  </label>
                  {groupStudents.length === 0 ? (
                    <p className="text-xs xs:text-sm text-gray-500 italic p-2.5 xs:p-3 bg-gray-50 rounded-lg">
                      Nu există elevi în această grupă
                    </p>
                  ) : (
                    <div className="border border-gray-200 rounded-lg max-h-48 xs:max-h-60 overflow-y-auto">
                      {groupStudents.map(gs => (
                        <label
                          key={gs.id}
                          className="flex items-center gap-2 xs:gap-3 p-2 xs:p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={formData.studentIds.includes(gs.studentId)}
                            onChange={() => toggleStudent(gs.studentId)}
                            className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-xs xs:text-sm truncate">{gs.student?.fullName}</p>
                            <p className="text-[10px] xs:text-xs text-gray-500">
                              Lecții: {gs.lessonsRemaining} • Absențe: {gs.absences}
                            </p>
                          </div>
                          {gs.absences > 0 && (
                            <span className="px-1.5 xs:px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] xs:text-xs font-medium rounded-full flex-shrink-0">
                              {gs.absences}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                  {formData.studentIds.length > 0 && (
                    <p className="mt-1.5 xs:mt-2 text-xs xs:text-sm text-indigo-600">
                      {formData.studentIds.length} elev(i) selectat(i)
                    </p>
                  )}
                </div>
              )}

              {/* Submit */}
              <div className="flex flex-col xs:flex-row justify-end gap-2 xs:gap-3 pt-3 xs:pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false)
                    setEditingLesson(null)
                    setFormData({ groupId: '', teacherId: '', branchId: '', locationDetails: '', scheduledAt: '', notes: '', studentIds: [] })
                    setGroupStudents([])
                    setDaySchedule(null)
                    setSelectedDate('')
                  }}
                  className="px-3 xs:px-4 py-2 text-sm xs:text-base text-gray-700 hover:bg-gray-100 rounded-lg transition-colors order-2 xs:order-1"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="px-4 xs:px-6 py-2 text-sm xs:text-base bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 xs:gap-2 order-1 xs:order-2"
                >
                  {updating ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 xs:h-4 xs:w-4 border-2 border-white border-t-transparent"></div>
                      <span className="hidden xs:inline">Se salvează...</span>
                      <span className="xs:hidden">Salvează...</span>
                    </>
                  ) : (
                    'Salvează Modificările'
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
