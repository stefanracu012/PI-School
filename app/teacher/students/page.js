'use client'

import { monthOptions, periodLabel } from '@/lib/payments'
import LevelSelect from '@/components/LevelSelect'
import { usePermissions } from '@/hooks/usePermissions'

// Cât timp poate profesorul să-și corecteze singur greșeala (ca pe server)
const ACTION_WINDOW_HOURS = 24
import DuplicateStudentWarning from '@/components/admin/DuplicateStudentWarning'

const MONTH_NAMES = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

// „octombrie 2026" — luna din care începe elevul
const startLabel = (student) =>
  student?.startYear && student?.startMonth
    ? `${MONTH_NAMES[student.startMonth - 1]} ${student.startYear}`
    : null

// Luna curentă, în formatul folosit de selectorul de plată
const currentPeriod = () => {
  const now = new Date()
  return `${now.getFullYear()}-${now.getMonth() + 1}`
}

import { useState, useEffect } from 'react'
import Link from 'next/link'
import StudentsLoading from './loading'
import {
  MagnifyingGlassIcon,
  UserIcon,
  PhoneIcon,
  AcademicCapIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  XMarkIcon,
  PencilSquareIcon,
  TrashIcon,
  BanknotesIcon,
  UserPlusIcon,
  StarIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

// Helper pentru formatarea programului
const formatSchedule = (scheduleDays, scheduleTime) => {
  if (!scheduleDays || scheduleDays.length === 0) return ''

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

  if (isSimple || uniqueTimes.length <= 1) {
    const time = isSimple ? scheduleTime : (uniqueTimes[0] || '')
    return `${scheduleDays.join(', ')}${time ? ' - ' + time : ''}`
  }

  return scheduleDays.map(day => `${day} ${times[day] || ''}`).join(', ')
}

export default function TeacherStudentsPage() {
  const { user, hasPermission, isSuperAdmin } = usePermissions()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [expandedStudent, setExpandedStudent] = useState(null)
  const [sortBy, setSortBy] = useState('name') // name, attendance, absences
  const [updatingStatus, setUpdatingStatus] = useState(null) // groupStudentId being updated

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showAddToGroupModal, setShowAddToGroupModal] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [creating, setCreating] = useState(false)
  const [addingPayment, setAddingPayment] = useState(false)
  const [addingToGroup, setAddingToGroup] = useState(false)

  // Form data
  const [studentForm, setStudentForm] = useState({
    fullName: '',
    age: '',
    level: '',
    startPeriod: '',
    parentName: '',
    parentPhone: '',
    parentEmail: '',
    notes: ''
  })
  const [paymentForm, setPaymentForm] = useState({
    groupStudentId: '',
    amount: '',
    debt: '',
    forPeriod: currentPeriod(),
    mode: 'MONTHLY',
    lessons: '8',
    paymentMethod: 'cash',
    notes: ''
  })
  const [addToGroupForm, setAddToGroupForm] = useState({
    groupId: ''
  })
  const [editingStudent, setEditingStudent] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

  /**
   * Corectarea merge doar pe elevii pe care i-a adăugat el și doar cât timp
   * greșeala e proaspătă — exact regula pe care o aplică și serverul, ca
   * butonul să nu promită ceva ce va fi refuzat.
   */
  const canCorrect = (student, permission) => {
    if (isSuperAdmin) return true
    if (!hasPermission(permission)) return false
    if (['SUPERADMIN', 'ADMIN'].includes(user?.role)) return true
    if (student.createdById && student.createdById !== user?.id) return false
    if (hasPermission('teacher.noTimeLimit')) return true
    if (!student.createdAt) return false
    const hours = (Date.now() - new Date(student.createdAt).getTime()) / 3600000
    return hours < ACTION_WINDOW_HOURS
  }

  const openEditModal = (student) => {
    setEditingStudent(student)
    setEditForm({
      fullName: student.name || '',
      age: student.age ?? '',
      isAdult: !!student.isAdult,
      level: student.level || '',
      startPeriod: student.startYear && student.startMonth
        ? `${student.startYear}-${student.startMonth}`
        : '',
      parentName: student.parentName || '',
      parentPhone: student.parentPhone || '',
      parentEmail: student.parentEmail || '',
      notes: student.notes || '',
    })
  }

  const handleEditStudent = async (e) => {
    e.preventDefault()
    if (!editForm.fullName.trim()) {
      toast.error('Numele elevului este obligatoriu')
      return
    }

    setSavingEdit(true)
    try {
      const res = await fetch(`/api/teacher/my-students/${editingStudent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: editForm.fullName,
          age: editForm.isAdult ? null : editForm.age,
          isAdult: editForm.isAdult,
          level: editForm.level,
          parentName: editForm.parentName,
          parentPhone: editForm.parentPhone,
          parentEmail: editForm.parentEmail,
          notes: editForm.notes,
          startYear: editForm.startPeriod ? parseInt(editForm.startPeriod.split('-')[0], 10) : null,
          startMonth: editForm.startPeriod ? parseInt(editForm.startPeriod.split('-')[1], 10) : null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Eroare la salvare')

      toast.success('Datele elevului au fost schimbate')
      setEditingStudent(null)
      setEditForm(null)
      fetchData()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeleteStudent = async (student) => {
    if (!confirm(`Ștergi elevul „${student.name}"? Dacă are plăți sau prezențe, ștergerea rămâne pe mâna administrației.`)) return

    try {
      const res = await fetch(`/api/teacher/my-students/${student.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Eroare la ștergere')
      toast.success('Elevul a fost șters')
      fetchData()
    } catch (error) {
      toast.error(error.message)
    }
  }

  // Status options for students
  const STATUS_OPTIONS = [
    { value: 'ACTIVE', label: 'Activ', color: 'bg-green-100 text-green-700' },
    { value: 'PAUSED', label: 'Pauză', color: 'bg-yellow-100 text-yellow-700' },
    { value: 'LEFT', label: 'Plecat', color: 'bg-red-100 text-red-700' },
    { value: 'COMPLETED', label: 'Terminat', color: 'bg-blue-100 text-blue-700' },
    { value: 'TRANSFERRED', label: 'Transferat', color: 'bg-purple-100 text-purple-700' }
  ]

  const getStatusInfo = (status) => {
    return STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0]
  }

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/teacher/students')
      const json = await res.json()
      setData(json)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Create new student
  const handleCreateStudent = async (e) => {
    e.preventDefault()
    if (!studentForm.fullName.trim()) {
      toast.error('Numele elevului este obligatoriu')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/teacher/my-students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...studentForm,
          startYear: studentForm.startPeriod ? parseInt(studentForm.startPeriod.slice(0, 4)) : null,
          startMonth: studentForm.startPeriod ? parseInt(studentForm.startPeriod.slice(5, 7)) : null,
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Eroare la creare')
      }

      toast.success('Elev creat cu succes!')
      setShowCreateModal(false)
      setStudentForm({ fullName: '', age: '', level: '', startPeriod: '', parentName: '', parentPhone: '', parentEmail: '', notes: '' })
      fetchData()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setCreating(false)
    }
  }

  // Add payment
  const handleAddPayment = async (e) => {
    e.preventDefault()
    if (!paymentForm.groupStudentId) {
      toast.error('Selectează o grupă')
      return
    }
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      toast.error('Introdu o sumă validă')
      return
    }

    setAddingPayment(true)
    try {
      const res = await fetch('/api/teacher/my-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupStudentId: paymentForm.groupStudentId,
          amount: paymentForm.amount,
          ...(paymentForm.mode === 'INDIVIDUAL'
            ? { lessonsAdded: parseInt(paymentForm.lessons, 10) || 0 }
            : {
                forYear: paymentForm.forPeriod ? parseInt(paymentForm.forPeriod.split('-')[0], 10) : null,
                forMonth: paymentForm.forPeriod ? parseInt(paymentForm.forPeriod.split('-')[1], 10) : null,
              }),
          paymentMethod: paymentForm.paymentMethod,
          notes: paymentForm.notes,
          debt: paymentForm.debt === '' ? null : parseFloat(paymentForm.debt),
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Eroare la adăugare plată')
      }

      toast.success('Plată înregistrată cu succes!')
      setShowPaymentModal(false)
      setPaymentForm({ groupStudentId: '', amount: '', debt: '', forPeriod: currentPeriod(), paymentMethod: 'cash', notes: '' })
      setSelectedStudent(null)
      fetchData()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setAddingPayment(false)
    }
  }

  // Update student status in a group
  const handleStatusChange = async (groupStudentId, newStatus) => {
    if (newStatus === 'TRANSFERRED') {
      toast.error('Statusul "Transferat" este setat automat de admin')
      return
    }

    setUpdatingStatus(groupStudentId)
    try {
      const res = await fetch(`/api/teacher/students/${groupStudentId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Eroare la actualizarea statusului')
      }

      toast.success('Status actualizat!')
      fetchData()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setUpdatingStatus(null)
    }
  }

  // Add student to group
  const handleAddToGroup = async (e) => {
    e.preventDefault()
    if (!addToGroupForm.groupId || !selectedStudent) {
      toast.error('Selectează o grupă')
      return
    }

    setAddingToGroup(true)
    try {
      const res = await fetch(`/api/teacher/my-groups/${addToGroupForm.groupId}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: selectedStudent.id })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Eroare la adăugare în grupă')
      }

      toast.success('Elev adăugat în grupă!')
      setShowAddToGroupModal(false)
      setAddToGroupForm({ groupId: '' })
      setSelectedStudent(null)
      fetchData()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setAddingToGroup(false)
    }
  }

  // Open payment modal for a student
  const openPaymentModal = (student) => {
    setSelectedStudent(student)
    setPaymentForm({
      groupStudentId: student.groups[0]?.groupStudentId || '',
      amount: '',
      debt: '',
      forPeriod: currentPeriod(),
      paymentMethod: 'cash',
      notes: ''
    })
    setShowPaymentModal(true)
  }

  // Open add to group modal
  const openAddToGroupModal = (student) => {
    setSelectedStudent(student)
    setAddToGroupForm({ groupId: '' })
    setShowAddToGroupModal(true)
  }

  // Get groups where student is not enrolled
  const getAvailableGroups = (student) => {
    const studentGroupIds = student.groups.map(g => g.groupId)
    return data?.groups?.filter(g => !studentGroupIds.includes(g.id)) || []
  }

  const filteredStudents = data?.students?.filter(student => {
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase()
      const matchesName = student.name?.toLowerCase().includes(searchLower)
      const matchesParent = student.parentName?.toLowerCase().includes(searchLower)
      const matchesParentPhone = student.parentPhone?.includes(search)
      const matchesParentEmail = student.parentEmail?.toLowerCase().includes(searchLower)
      if (!matchesName && !matchesParent && !matchesParentPhone && !matchesParentEmail) return false
    }

    // Group filter
    if (selectedGroup) {
      const hasGroup = student.groups.some(g => g.groupId === selectedGroup)
      if (!hasGroup) return false
    }

    return true
  }).sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    if (sortBy === 'attendance') return b.attendanceRate - a.attendanceRate
    if (sortBy === 'absences') return b.totalAbsences - a.totalAbsences
    return 0
  }) || []

  const getAttendanceColor = (rate) => {
    if (rate >= 90) return 'text-green-600 bg-green-50'
    if (rate >= 70) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
  }

  // Calculate students with lesson issues
  // Doar grupele cu plată individuală au pachet per elev; la cele lunare
  // „lecțiile rămase" nu înseamnă nimic.
  const individualGroups = (s) => s.groups.filter(g => g.billingType === 'INDIVIDUAL')
  const studentsWithZeroLessons = filteredStudents.filter(s =>
    individualGroups(s).some(g => g.remainingLessons === 0)
  )
  const studentsWithLowLessons = filteredStudents.filter(s =>
    individualGroups(s).some(g => g.remainingLessons > 0 && g.remainingLessons <= 2) &&
    !individualGroups(s).some(g => g.remainingLessons === 0)
  )

  if (loading) {
    return <StudentsLoading />
  }

  return (
    <div className="space-y-4 xs:space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl xs:text-2xl font-bold text-gray-900">Elevii Mei</h1>
          <p className="text-gray-600 mt-1 text-xs xs:text-sm md:text-base">Vezi toți elevii din grupele tale și informațiile lor</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-lg transition-colors text-sm"
        >
          <PlusIcon className="w-4 h-4" />
          Elev Nou
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 xs:gap-3 md:gap-4">
        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-1.5 xs:gap-2 md:gap-3">
            <div className="p-1.5 xs:p-2 bg-blue-100 rounded-lg">
              <UserIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] xs:text-xs text-gray-500 truncate">Total Elevi</p>
              <p className="text-base xs:text-lg md:text-xl font-bold text-gray-900">{data?.stats?.totalStudents || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-1.5 xs:gap-2 md:gap-3">
            <div className="p-1.5 xs:p-2 bg-purple-100 rounded-lg">
              <AcademicCapIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] xs:text-xs text-gray-500 truncate">Total Grupe</p>
              <p className="text-base xs:text-lg md:text-xl font-bold text-gray-900">{data?.stats?.totalGroups || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-1.5 xs:gap-2 md:gap-3">
            <div className="p-1.5 xs:p-2 bg-green-100 rounded-lg">
              <svg className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] xs:text-xs text-gray-500 truncate">Prezență Medie</p>
              <p className="text-base xs:text-lg md:text-xl font-bold text-gray-900">{data?.stats?.averageAttendance || 0}%</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-1.5 xs:gap-2 md:gap-3">
            <div className="p-1.5 xs:p-2 bg-orange-100 rounded-lg">
              <ExclamationTriangleIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 md:w-5 md:h-5 text-orange-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] xs:text-xs text-gray-500 truncate">Cu Absențe</p>
              <p className="text-base xs:text-lg md:text-xl font-bold text-gray-900">{data?.stats?.studentsWithAbsences || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Warning Messages */}
      {studentsWithZeroLessons.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 flex items-start gap-2 xs:gap-3">
          <ExclamationTriangleIcon className="w-4 h-4 xs:w-5 xs:h-5 md:w-6 md:h-6 text-red-600 flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-red-800 text-xs xs:text-sm md:text-base">
              Atenție: {studentsWithZeroLessons.length} {studentsWithZeroLessons.length === 1 ? 'elev' : 'elevi'} cu 0 lecții rămase!
            </p>
            <p className="text-[10px] xs:text-xs md:text-sm text-red-700 mt-0.5 xs:mt-1 break-words">
              {studentsWithZeroLessons.map(s => s.name).join(', ')} - Nu au achitat pentru lecții suplimentare.
            </p>
          </div>
        </div>
      )}

      {studentsWithLowLessons.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 flex items-start gap-2 xs:gap-3">
          <ExclamationTriangleIcon className="w-4 h-4 xs:w-5 xs:h-5 md:w-6 md:h-6 text-amber-600 flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-amber-800 text-xs xs:text-sm md:text-base">
              Atenție: {studentsWithLowLessons.length} {studentsWithLowLessons.length === 1 ? 'elev are' : 'elevi au'} puține lecții rămase
            </p>
            <p className="text-[10px] xs:text-xs md:text-sm text-amber-700 mt-0.5 xs:mt-1 break-words">
              {studentsWithLowLessons.map(s => {
                const minLessons = Math.min(...individualGroups(s).map(g => g.remainingLessons))
                return `${s.name} (${minLessons})`
              }).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg xs:rounded-xl p-3 xs:p-4 border border-gray-200 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-2 xs:gap-3">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2.5 xs:left-3 top-1/2 -translate-y-1/2 w-4 h-4 xs:w-5 xs:h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Caută după nume, telefon..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 xs:pl-10 pr-3 xs:pr-4 py-2 xs:py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#30919f] focus:border-[#30919f] text-xs xs:text-sm"
              />
            </div>
          </div>

          {/* Group Filter */}
          <div className="flex gap-2 xs:gap-3">
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="flex-1 sm:flex-none px-2.5 xs:px-3 py-2 xs:py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#30919f] focus:border-[#30919f] text-xs xs:text-sm"
            >
              <option value="">Toate grupele</option>
              {data?.groups?.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="flex-1 sm:flex-none px-2.5 xs:px-3 py-2 xs:py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-[#30919f] focus:border-[#30919f] text-xs xs:text-sm"
            >
              <option value="name">Nume</option>
              <option value="attendance">Prezență</option>
              <option value="absences">Absențe</option>
            </select>
          </div>
        </div>
      </div>

      {/* Students List */}
      <div className="space-y-2 xs:space-y-3 md:space-y-4">
        {filteredStudents.length === 0 ? (
          <div className="bg-white rounded-xl p-6 xs:p-8 border border-gray-200 text-center">
            <UserIcon className="w-10 h-10 xs:w-12 xs:h-12 mx-auto text-gray-300 mb-2 xs:mb-3" />
            <p className="text-gray-500 text-xs xs:text-sm md:text-base">Nu ai niciun elev în grupe</p>
          </div>
        ) : (
          filteredStudents.map(student => {
            const hasZeroLessons = individualGroups(student).some(g => g.remainingLessons === 0)
            const hasLowLessons = individualGroups(student).some(g => g.remainingLessons > 0 && g.remainingLessons <= 2)

            return (
            <div
              key={student.id}
              className={`bg-white rounded-lg xs:rounded-xl border shadow-sm overflow-hidden ${
                hasZeroLessons ? 'border-red-300 bg-red-50/30' :
                hasLowLessons ? 'border-amber-300 bg-amber-50/30' :
                'border-gray-200'
              }`}
            >
              {/* Student Header - Clickable */}
              <div
                className="p-3 xs:p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedStudent(expandedStudent === student.id ? null : student.id)}
              >
                <div className="flex items-center justify-between gap-2 xs:gap-3">
                  <div className="flex items-center gap-2 xs:gap-3 min-w-0 flex-1">
                    {/* Avatar */}
                    <div className="w-9 h-9 xs:w-10 xs:h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-[#30919f] to-[#2a7d89] flex items-center justify-center flex-shrink-0">
                      {student.name ? (
                        <span className="text-sm xs:text-base md:text-lg font-bold text-white">
                          {student.name.charAt(0).toUpperCase()}
                        </span>
                      ) : (
                        <UserIcon className="w-4 h-4 xs:w-5 xs:h-5 md:w-6 md:h-6 text-white" />
                      )}
                    </div>

                    {/* Basic Info */}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-gray-900 text-xs xs:text-sm md:text-base truncate">{student.name || 'Elev fără nume'}</h3>
                      <div className="flex flex-wrap items-center gap-x-2 xs:gap-x-3 gap-y-0.5 text-[10px] xs:text-xs text-gray-500 mt-0.5">
                        {student.parentPhone && (
                          <span className="flex items-center gap-0.5 xs:gap-1">
                            <PhoneIcon className="w-3 h-3 xs:w-3.5 xs:h-3.5" />
                            <span className="hidden xs:inline">{student.parentPhone}</span>
                          </span>
                        )}
                        <span className="flex items-center gap-0.5 xs:gap-1 text-[#30919f]">
                          <AcademicCapIcon className="w-3 h-3 xs:w-3.5 xs:h-3.5" />
                          {student.groups.length} {student.groups.length === 1 ? 'grupă' : 'grupe'}
                        </span>
                        {student.level && (
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                            {student.level}
                          </span>
                        )}
                        {startLabel(student) && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium capitalize">
                            începe {startLabel(student)}
                          </span>
                        )}
                      </div>
                      {/* Remaining lessons preview */}
                      {student.groups.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {student.groups.slice(0, 2).map(g => (
                            g.billingType === 'INDIVIDUAL' ? (
                              <span
                                key={g.groupId}
                                className={`text-[10px] xs:text-xs px-1.5 xs:px-2 py-0.5 rounded font-medium ${
                                  g.remainingLessons === 0
                                    ? 'bg-red-100 text-red-700'
                                    : g.remainingLessons <= 2
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-blue-50 text-blue-700'
                                }`}
                              >
                                {g.remainingLessons} ore
                              </span>
                            ) : (
                              <span
                                key={g.groupId}
                                className="text-[10px] xs:text-xs px-1.5 xs:px-2 py-0.5 rounded font-medium bg-gray-100 text-gray-700"
                                title="Prezențe / absențe în luna curentă"
                              >
                                <span className="text-emerald-700">{g.monthPresent ?? 0}</span>
                                <span className="text-gray-400"> / </span>
                                <span className="text-red-700">{g.monthAbsent ?? 0}</span>
                              </span>
                            )
                          ))}
                          {student.groups.length > 2 && (
                            <span className="text-[10px] xs:text-xs text-gray-400">+{student.groups.length - 2}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stats & Expand */}
                  <div className="flex items-center gap-1.5 xs:gap-2 flex-shrink-0">
                    {/* Attendance Badge */}
                    <div className={`px-1.5 xs:px-2 md:px-3 py-0.5 xs:py-1 rounded-full text-[10px] xs:text-xs md:text-sm font-medium ${getAttendanceColor(student.attendanceRate)}`}>
                      {student.attendanceRate}%
                    </div>

                    {/* Absences Badge - hidden on smallest screens */}
                    {student.totalAbsences > 0 && (
                      <div className="hidden xs:flex px-2 md:px-3 py-0.5 xs:py-1 rounded-full text-[10px] xs:text-xs md:text-sm font-medium bg-red-100 text-red-700">
                        {student.totalAbsences} abs
                      </div>
                    )}

                    {/* Expand Icon */}
                    {expandedStudent === student.id ? (
                      <ChevronUpIcon className="w-4 h-4 xs:w-5 xs:h-5 text-gray-400" />
                    ) : (
                      <ChevronDownIcon className="w-4 h-4 xs:w-5 xs:h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedStudent === student.id && (
                <div className="border-t border-gray-100 bg-gray-50 p-3 xs:p-4">
                  <div className="grid md:grid-cols-2 gap-4 xs:gap-5 md:gap-6">
                    {/* Contact Info */}
                    <div>
                      <h4 className="text-xs xs:text-sm font-semibold text-gray-700 mb-2 xs:mb-3">Informații Contact</h4>
                      <div className="space-y-1.5 xs:space-y-2 text-xs xs:text-sm">
                        {student.parentName && (
                          <div className="flex items-start gap-1.5 xs:gap-2">
                            <span className="text-gray-500 min-w-[60px] xs:min-w-[80px]">Părinte:</span>
                            <span className="text-gray-900 break-words">{student.parentName}</span>
                          </div>
                        )}
                        {student.parentPhone && (
                          <div className="flex items-start gap-1.5 xs:gap-2">
                            <span className="text-gray-500 min-w-[60px] xs:min-w-[80px]">Telefon:</span>
                            <a href={`tel:${student.parentPhone}`} className="text-[#30919f] hover:underline">
                              {student.parentPhone}
                            </a>
                          </div>
                        )}
                        {student.parentEmail && (
                          <div className="flex items-start gap-1.5 xs:gap-2">
                            <span className="text-gray-500 min-w-[60px] xs:min-w-[80px]">Email:</span>
                            <a href={`mailto:${student.parentEmail}`} className="text-[#30919f] hover:underline break-all">
                              {student.parentEmail}
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Notes */}
                      {student.notes && (
                        <div className="mt-3 xs:mt-4">
                          <h4 className="text-xs xs:text-sm font-semibold text-gray-700 mb-1.5 xs:mb-2">Notițe</h4>
                          <p className="text-xs xs:text-sm text-gray-600 bg-white p-2 xs:p-3 rounded-lg border border-gray-200">
                            {student.notes}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Groups Info */}
                    <div>
                      <h4 className="text-xs xs:text-sm font-semibold text-gray-700 mb-2 xs:mb-3">Grupe & Ore</h4>
                      <div className="space-y-2 xs:space-y-3">
                        {student.groups.map(group => (
                          <div
                            key={group.groupId}
                            className="bg-white rounded-lg border border-gray-200 p-2.5 xs:p-3"
                          >
                            <div className="flex items-start justify-between mb-1.5 xs:mb-2">
                              <div className="min-w-0 flex-1">
                                <Link
                                  href={`/teacher/groups/${group.groupId}`}
                                  className="font-medium text-gray-900 hover:text-[#30919f] text-xs xs:text-sm truncate block"
                                >
                                  {group.groupName}
                                </Link>
                                <p className="text-[10px] xs:text-xs text-gray-500 truncate">{group.levelName}</p>
                              </div>
                              <div className={`px-1.5 xs:px-2 py-0.5 rounded text-[10px] xs:text-xs font-medium ${getAttendanceColor(group.attendanceRate)}`}>
                                {group.attendanceRate}%
                              </div>
                            </div>

                            {/* Status Selector */}
                            <div className="mb-2">
                              <select
                                value={group.status || 'ACTIVE'}
                                onChange={(e) => {
                                  e.stopPropagation()
                                  handleStatusChange(group.groupStudentId, e.target.value)
                                }}
                                onClick={(e) => e.stopPropagation()}
                                disabled={updatingStatus === group.groupStudentId || group.status === 'TRANSFERRED'}
                                className={`w-full px-2 py-1 rounded text-[10px] xs:text-xs font-medium border-0 cursor-pointer disabled:cursor-not-allowed ${getStatusInfo(group.status || 'ACTIVE').color}`}
                              >
                                {STATUS_OPTIONS.filter(s => s.value !== 'TRANSFERRED').map(s => (
                                  <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                                {group.status === 'TRANSFERRED' && (
                                  <option value="TRANSFERRED">Transferat</option>
                                )}
                              </select>
                            </div>

                            {group.scheduleDays?.length > 0 && (
                              <p className="text-[10px] xs:text-xs text-gray-500 mb-1.5 xs:mb-2">📅 {formatSchedule(group.scheduleDays, group.scheduleTime)}</p>
                            )}

                            <div className="grid grid-cols-2 gap-1.5 xs:gap-2 text-[10px] xs:text-xs">
                              {group.billingType === 'INDIVIDUAL' ? (
                                <>
                                  <div className={`rounded p-1.5 xs:p-2 text-center ${
                                    group.remainingLessons === 0 ? 'bg-red-100' :
                                    group.remainingLessons <= 2 ? 'bg-amber-100' : 'bg-blue-50'
                                  }`}>
                                    <p className={`font-medium ${
                                      group.remainingLessons === 0 ? 'text-red-600' :
                                      group.remainingLessons <= 2 ? 'text-amber-600' : 'text-blue-600'
                                    }`}>Ore rămase</p>
                                    <p className={`text-base xs:text-lg font-bold ${
                                      group.remainingLessons === 0 ? 'text-red-700' :
                                      group.remainingLessons <= 2 ? 'text-amber-700' : 'text-blue-700'
                                    }`}>{group.remainingLessons}</p>
                                  </div>
                                  <div className="bg-red-50 rounded p-1.5 xs:p-2 text-center">
                                    <p className="text-red-600 font-medium">Absențe</p>
                                    <p className="text-base xs:text-lg font-bold text-red-700">{group.absentCount ?? 0}</p>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="bg-emerald-50 rounded p-1.5 xs:p-2 text-center">
                                    <p className="text-emerald-600 font-medium">Prezențe {MONTH_NAMES[new Date().getMonth()]}</p>
                                    <p className="text-base xs:text-lg font-bold text-emerald-700">{group.monthPresent ?? 0}</p>
                                  </div>
                                  <div className="bg-red-50 rounded p-1.5 xs:p-2 text-center">
                                    <p className="text-red-600 font-medium">Absențe {MONTH_NAMES[new Date().getMonth()]}</p>
                                    <p className="text-base xs:text-lg font-bold text-red-700">{group.monthAbsent ?? 0}</p>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Overall Stats */}
                      <div className="mt-3 xs:mt-4 bg-gradient-to-r from-[#30919f] to-[#2a7d89] rounded-lg p-3 xs:p-4 text-white">
                        <h4 className="text-[10px] xs:text-xs font-semibold mb-2 xs:mb-3 opacity-90">Total General</h4>
                        <div className="grid grid-cols-3 gap-1.5 xs:gap-2 text-center">
                          <div>
                            <p className="text-lg xs:text-xl md:text-2xl font-bold">{student.totalPresent}</p>
                            <p className="text-[9px] xs:text-[10px] md:text-xs opacity-80">Prezențe</p>
                          </div>
                          <div>
                            <p className="text-lg xs:text-xl md:text-2xl font-bold">{student.totalAbsent}</p>
                            <p className="text-[9px] xs:text-[10px] md:text-xs opacity-80">Absențe</p>
                          </div>
                          <div>
                            <p className="text-lg xs:text-xl md:text-2xl font-bold">{student.totalAbsences}</p>
                            <p className="text-[9px] xs:text-[10px] md:text-xs opacity-80">Recuperat</p>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-3 xs:mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); openPaymentModal(student); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-xs xs:text-sm font-medium transition-colors"
                        >
                          <BanknotesIcon className="w-4 h-4" />
                          Adaugă Plată
                        </button>
                        {getAvailableGroups(student).length > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openAddToGroupModal(student); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-xs xs:text-sm font-medium transition-colors"
                          >
                            <UserPlusIcon className="w-4 h-4" />
                            Adaugă în Grupă
                          </button>
                        )}
                        {canCorrect(student, 'teacher.student.edit') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(student); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-xs xs:text-sm font-medium transition-colors"
                          >
                            <PencilSquareIcon className="w-4 h-4" />
                            Editează
                          </button>
                        )}
                        {canCorrect(student, 'teacher.student.delete') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteStudent(student); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-xs xs:text-sm font-medium transition-colors"
                          >
                            <TrashIcon className="w-4 h-4" />
                            Șterge
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )})
        )}
      </div>

      {/* Editare elev — aceleași câmpuri ca la creare */}
      {editingStudent && editForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Editează elevul</h2>
                <p className="text-xs text-gray-500">{editingStudent.name}</p>
              </div>
              <button
                onClick={() => { setEditingStudent(null); setEditForm(null) }}
                className="p-1 hover:bg-gray-100 rounded text-gray-700"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditStudent} className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Nume Complet *</label>
                <input
                  type="text"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Vârstă</label>
                  {editForm.isAdult ? (
                    <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm">
                      Adult
                    </div>
                  ) : (
                    <input
                      type="number" min="1" max="99"
                      value={editForm.age}
                      onChange={(e) => setEditForm({ ...editForm, age: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900"
                    />
                  )}
                  <label className="mt-1 flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.isAdult}
                      onChange={(e) => setEditForm({
                        ...editForm,
                        isAdult: e.target.checked,
                        age: e.target.checked ? '' : editForm.age,
                      })}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    Adult
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Nivel</label>
                  <LevelSelect
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900"
                    value={editForm.level}
                    onChange={(e) => setEditForm({ ...editForm, level: e.target.value })}
                    emptyLabel="Nespecificat"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Începe din</label>
                <select
                  value={editForm.startPeriod}
                  onChange={(e) => setEditForm({ ...editForm, startPeriod: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900"
                >
                  <option value="">Nespecificat</option>
                  {monthOptions().map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Părinte</label>
                  <input
                    type="text"
                    value={editForm.parentName}
                    onChange={(e) => setEditForm({ ...editForm, parentName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Telefon</label>
                  <input
                    type="tel"
                    value={editForm.parentPhone}
                    onChange={(e) => setEditForm({ ...editForm, parentPhone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.parentEmail}
                  onChange={(e) => setEditForm({ ...editForm, parentEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Notițe</label>
                <textarea
                  rows={3}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setEditingStudent(null); setEditForm(null) }}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 bg-[#30919f] text-white rounded-lg hover:bg-[#2a7d89] disabled:opacity-50"
                >
                  {savingEdit ? 'Se salvează…' : 'Salvează'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Student Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Elev Nou</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-gray-100 rounded text-gray-700">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateStudent} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Nume Complet *</label>
                <input
                  type="text"
                  value={studentForm.fullName}
                  onChange={(e) => setStudentForm({ ...studentForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900 placeholder-gray-500"
                  placeholder="Ex: Ion Popescu"
                  required
                />
              </div>
              <DuplicateStudentWarning
                name={studentForm.fullName}
                phone={studentForm.parentPhone}
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Vârstă</label>
                  <input
                    type="number"
                    value={studentForm.age}
                    onChange={(e) => setStudentForm({ ...studentForm, age: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900 placeholder-gray-500"
                    placeholder="Ex: 10"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Nume Părinte</label>
                  <input
                    type="text"
                    value={studentForm.parentName}
                    onChange={(e) => setStudentForm({ ...studentForm, parentName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900 placeholder-gray-500"
                    placeholder="Ex: Maria Popescu"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Nivel</label>
                  <LevelSelect
                    value={studentForm.level}
                    onChange={(e) => setStudentForm({ ...studentForm, level: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900"
                    emptyLabel="— Nespecificat —"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Începe din luna</label>
                  <input
                    type="month"
                    value={studentForm.startPeriod}
                    onChange={(e) => setStudentForm({ ...studentForm, startPeriod: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">Lasă gol dacă începe acum.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Telefon Părinte</label>
                  <input
                    type="tel"
                    value={studentForm.parentPhone}
                    onChange={(e) => setStudentForm({ ...studentForm, parentPhone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900 placeholder-gray-500"
                    placeholder="Ex: 0722123456"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Email Părinte</label>
                  <input
                    type="email"
                    value={studentForm.parentEmail}
                    onChange={(e) => setStudentForm({ ...studentForm, parentEmail: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900 placeholder-gray-500"
                    placeholder="Ex: email@exemplu.ro"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Notițe</label>
                <textarea
                  value={studentForm.notes}
                  onChange={(e) => setStudentForm({ ...studentForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900 placeholder-gray-500"
                  placeholder="Observații despre elev..."
                />
              </div>
              <p className="text-xs text-gray-500">Elevul va fi creat cu 0 lecții. Adaugă-l într-o grupă și înregistrează o plată pentru a-i adăuga lecții.</p>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
                  Anulează
                </button>
                <button type="submit" disabled={creating} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">
                  {creating ? 'Se creează...' : 'Creează'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Adaugă Plată</h2>
              <button onClick={() => { setShowPaymentModal(false); setSelectedStudent(null); }} className="p-1 hover:bg-gray-100 rounded text-gray-700">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddPayment} className="p-4 space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-900">{selectedStudent.name}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Grupa *</label>
                <select
                  value={paymentForm.groupStudentId}
                  onChange={(e) => setPaymentForm({ ...paymentForm, groupStudentId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900"
                  required
                >
                  <option value="">Selectează grupa</option>
                  {selectedStudent.groups.map(g => (
                    <option key={g.groupStudentId} value={g.groupStudentId}>
                      {g.groupName}
                      {g.billingType === 'INDIVIDUAL' ? ` (${g.remainingLessons} ore rămase)` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Sumă (MDL) *</label>
                  <input
                    type="number"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPaymentForm({ ...paymentForm, mode: 'MONTHLY' })}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    paymentForm.mode === 'MONTHLY' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  Lunar
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentForm({ ...paymentForm, mode: 'INDIVIDUAL' })}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    paymentForm.mode === 'INDIVIDUAL' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  Per lecție
                </button>
              </div>

              {paymentForm.mode === 'INDIVIDUAL' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Lecții achitate *</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={paymentForm.lessons}
                    onChange={(e) => setPaymentForm({ ...paymentForm, lessons: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Plată pentru luna *</label>
                  <select
                    value={paymentForm.forPeriod}
                    onChange={(e) => setPaymentForm({ ...paymentForm, forPeriod: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900"
                  >
                    {monthOptions().map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}{o.isCurrent ? ' (curentă)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Datorie rămasă (MDL)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentForm.debt}
                  onChange={(e) => setPaymentForm({ ...paymentForm, debt: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-teal-500"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Cât mai are de plată. Lasă gol dacă a achitat tot.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Metodă Plată</label>
                <select
                  value={paymentForm.paymentMethod}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="transfer">Transfer Bancar</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Notițe</label>
                <input
                  type="text"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900"
                  placeholder="Ex: Plată pentru luna ianuarie"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowPaymentModal(false); setSelectedStudent(null); }} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
                  Anulează
                </button>
                <button type="submit" disabled={addingPayment} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                  {addingPayment ? 'Se adaugă...' : 'Înregistrează Plata'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add to Group Modal */}
      {showAddToGroupModal && selectedStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Adaugă în Grupă</h2>
              <button onClick={() => { setShowAddToGroupModal(false); setSelectedStudent(null); }} className="p-1 hover:bg-gray-100 rounded">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddToGroup} className="p-4 space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="font-medium">{selectedStudent.name}</div>
                <div className="text-sm text-gray-500">
                  Grupe actuale: {selectedStudent.groups.map(g => g.groupName).join(', ') || 'Niciuna'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Selectează Grupa *</label>
                <select
                  value={addToGroupForm.groupId}
                  onChange={(e) => setAddToGroupForm({ groupId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900"
                  required
                >
                  <option value="">Alege o grupă</option>
                  {getAvailableGroups(selectedStudent).map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-500">Elevul va fi adăugat cu 0 lecții în această grupă.</p>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowAddToGroupModal(false); setSelectedStudent(null); }} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
                  Anulează
                </button>
                <button type="submit" disabled={addingToGroup} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {addingToGroup ? 'Se adaugă...' : 'Adaugă în Grupă'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
