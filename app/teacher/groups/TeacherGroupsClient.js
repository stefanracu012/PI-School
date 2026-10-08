'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  PlusIcon,
  XMarkIcon,
  AcademicCapIcon,
  CalendarDaysIcon,
  UserPlusIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import LevelSelect from '@/components/LevelSelect'
import StartSessionButton from '@/components/teacher/StartSessionButton'
import { getDaysFromToday, getTodayName, getTomorrowName, nearestDay } from '@/lib/scheduleDays'

// Helper pentru formatarea programului
const formatSchedule = (scheduleDays, scheduleTime) => {
  if (!scheduleDays || scheduleDays.length === 0) return 'Program nestabilit'
  
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

const DAYS = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică']

export default function TeacherGroupsClient({ initialGroups, branches, allGroups, isSuperTeacher = false }) {
  const [groups, setGroups] = useState(initialGroups)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAddStudentModal, setShowAddStudentModal] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [myStudents, setMyStudents] = useState([])
  const [creating, setCreating] = useState(false)
  const [addingStudent, setAddingStudent] = useState(false)
  const [loadingStudents, setLoadingStudents] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    level: '',
    branchId: '',
    scheduleDays: [],
    scheduleTimes: {}, // { 'Luni': '14:00', 'Miercuri': '16:00' }
    locationType: 'offline',
    locationDetails: '',
    startDate: ''
  })

  const [selectedStudentId, setSelectedStudentId] = useState('')

  const fetchMyStudents = async () => {
    setLoadingStudents(true)
    try {
      const res = await fetch('/api/teacher/my-students')
      const json = await res.json()
      setMyStudents(json.students || [])
    } catch (error) {
      console.error('Error fetching students:', error)
    } finally {
      setLoadingStudents(false)
    }
  }

  const refreshGroups = async () => {
    try {
      const res = await fetch('/api/teacher/my-groups')
      const json = await res.json()
      setGroups(json.groups || [])
    } catch (error) {
      console.error('Error refreshing groups:', error)
    }
  }

  const handleCreateGroup = async (e) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast.error('Numele grupei este obligatoriu')
      return
    }

    setCreating(true)
    try {
      // Convert scheduleTimes object to JSON string for API
      const scheduleTime = Object.keys(formData.scheduleTimes).length > 0 
        ? JSON.stringify(formData.scheduleTimes)
        : ''
      
      const res = await fetch('/api/teacher/my-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          scheduleTime
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Eroare la creare')
      }

      toast.success('Grupă creată cu succes!')
      setShowCreateModal(false)
      setFormData({
        name: '',
        level: '',
        branchId: '',
        scheduleDays: [],
        scheduleTimes: {},
        locationType: 'offline',
        locationDetails: '',
        startDate: ''
      })
      refreshGroups()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setCreating(false)
    }
  }

  const handleAddStudent = async (e) => {
    e.preventDefault()
    if (!selectedStudentId || !selectedGroup) {
      toast.error('Selectează un elev')
      return
    }

    setAddingStudent(true)
    try {
      const res = await fetch(`/api/teacher/my-groups/${selectedGroup.id}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: selectedStudentId })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Eroare la adăugare')
      }

      toast.success('Elev adăugat cu succes!')
      setShowAddStudentModal(false)
      setSelectedStudentId('')
      setSelectedGroup(null)
      refreshGroups()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setAddingStudent(false)
    }
  }

  const toggleDay = (day) => {
    setFormData(prev => {
      const isSelected = prev.scheduleDays.includes(day)
      const newScheduleDays = isSelected
        ? prev.scheduleDays.filter(d => d !== day)
        : [...prev.scheduleDays, day]
      
      // Also update scheduleTimes - remove time for unselected day
      const newScheduleTimes = { ...prev.scheduleTimes }
      if (isSelected) {
        delete newScheduleTimes[day]
      }
      
      return {
        ...prev,
        scheduleDays: newScheduleDays,
        scheduleTimes: newScheduleTimes
      }
    })
  }

  const updateDayTime = (day, time) => {
    setFormData(prev => ({
      ...prev,
      scheduleTimes: {
        ...prev.scheduleTimes,
        [day]: time
      }
    }))
  }

  const openAddStudentModal = async (group) => {
    setSelectedGroup(group)
    await fetchMyStudents()
    setShowAddStudentModal(true)
  }

  // Filter students that are not already in the selected group
  const availableStudents = myStudents.filter(student => {
    if (!selectedGroup) return true
    return !student.groups?.some(g => g.groupId === selectedGroup.id)
  })

  // Filter groups for schedule display based on selected branch and days
  const getFilteredScheduleGroups = () => {
    if (!allGroups) return []
    
    return allGroups.filter(group => {
      // Filter by branch if selected
      if (formData.branchId && group.branchId !== formData.branchId) {
        return false
      }
      
      // Filter by selected days if any selected
      if (formData.scheduleDays.length > 0) {
        const groupDays = group.scheduleDays || []
        const hasMatchingDay = formData.scheduleDays.some(day => groupDays.includes(day))
        if (!hasMatchingDay) return false
      }
      
      return true
    })
  }

  // Parse schedule time to get time for a specific day
  const getTimeForDay = (scheduleTime, day) => {
    if (!scheduleTime) return null
    try {
      if (scheduleTime.startsWith('{')) {
        const times = JSON.parse(scheduleTime)
        return times[day] || null
      }
      return scheduleTime
    } catch {
      return scheduleTime
    }
  }

  // Grupele mele, ordonate ca la /orar: azi, mâine, apoi restul zilelor.
  // Fiecare grupă apare o singură dată, sub cea mai apropiată zi din programul ei.
  const groupSections = useMemo(() => {
    const todayName = getTodayName()
    const tomorrowName = getTomorrowName()
    const orderedDays = getDaysFromToday()

    const buckets = {}
    orderedDays.forEach(d => { buckets[d] = [] })
    const noSchedule = []

    groups.forEach(group => {
      const day = nearestDay(group.scheduleDays)
      if (!day || !buckets[day]) {
        noSchedule.push(group)
        return
      }
      buckets[day].push(group)
    })

    orderedDays.forEach(day => {
      buckets[day].sort((a, b) => {
        const ta = getTimeForDay(a.scheduleTime, day) || ''
        const tb = getTimeForDay(b.scheduleTime, day) || ''
        if (!ta) return 1
        if (!tb) return -1
        return ta.localeCompare(tb)
      })
    })

    const sections = orderedDays
      .filter(day => buckets[day].length > 0)
      .map(day => ({
        day,
        isToday: day === todayName,
        isTomorrow: day === tomorrowName,
        groups: buckets[day],
      }))

    if (noSchedule.length > 0) {
      sections.push({ day: 'Fără program stabilit', isToday: false, isTomorrow: false, groups: noSchedule })
    }

    return sections
  }, [groups])

  const renderGroupCard = (group) => (
    <div
      key={group.id}
      className="bg-white rounded-xl shadow-sm p-4 xs:p-5 md:p-6 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-3 xs:mb-4">
        <div className="flex-1 min-w-0 pr-2">
          <Link
            href={`/teacher/groups/${group.id}`}
            className="text-base xs:text-lg font-bold text-gray-900 hover:text-teal-600 truncate block"
          >
            {group.name}
          </Link>
          <p className="text-xs xs:text-sm text-gray-500 truncate">{group.level}</p>
        </div>
        <span className={`px-2 py-1 text-[10px] xs:text-xs font-medium rounded-full whitespace-nowrap flex-shrink-0 ${
          group.active
            ? 'bg-green-100 text-green-800'
            : 'bg-gray-100 text-gray-600'
        }`}>
          {group.active ? 'Activ' : 'Inactiv'}
        </span>
      </div>

      <div className="space-y-1.5 xs:space-y-2 mb-3 xs:mb-4">
        <div className="flex items-center gap-1.5 xs:gap-2 text-xs xs:text-sm text-gray-600">
          <AcademicCapIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 flex-shrink-0" />
          <span className="truncate">
            {group.groupStudents?.filter(gs => gs.status === 'ACTIVE' || !gs.status).length || 0} elevi activi
          </span>
        </div>
        <div className="flex items-center gap-1.5 xs:gap-2 text-xs xs:text-sm text-gray-600">
          <CalendarDaysIcon className="w-3.5 h-3.5 xs:w-4 xs:h-4 flex-shrink-0" />
          <span className="truncate">{formatSchedule(group.scheduleDays, group.scheduleTime)}</span>
        </div>
      </div>

      {/* Students preview - only active */}
      {group.groupStudents?.filter(gs => gs.status === 'ACTIVE' || !gs.status).length > 0 && (
        <div className="border-t border-gray-100 pt-3 xs:pt-4 mb-3">
          <p className="text-[10px] xs:text-xs text-gray-500 mb-1.5 xs:mb-2">Elevi activi:</p>
          <div className="flex flex-wrap gap-1">
            {group.groupStudents.filter(gs => gs.status === 'ACTIVE' || !gs.status).slice(0, 5).map(gs => (
              <span
                key={gs.student?.id || gs.id}
                className="px-1.5 xs:px-2 py-0.5 xs:py-1 bg-gray-100 text-gray-600 text-[10px] xs:text-xs rounded"
              >
                {gs.student?.fullName?.split(' ')[0] || 'Elev'}
              </span>
            ))}
            {group.groupStudents.filter(gs => gs.status === 'ACTIVE' || !gs.status).length > 5 && (
              <span className="px-1.5 xs:px-2 py-0.5 xs:py-1 bg-gray-100 text-gray-600 text-[10px] xs:text-xs rounded">
                +{group.groupStudents.filter(gs => gs.status === 'ACTIVE' || !gs.status).length - 5}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-3 xs:pt-4 border-t border-gray-100">
        <div className="w-full">
          <StartSessionButton
            groupId={group.id}
            scheduleDays={group.scheduleDays}
            scheduleTime={group.scheduleTime}
            isSuperTeacher={isSuperTeacher}
          />
        </div>
        <Link
          href={`/teacher/groups/${group.id}`}
          className="flex-1 text-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-xs xs:text-sm"
        >
          Vezi Detalii
        </Link>
        <button
          onClick={() => openAddStudentModal(group)}
          className="flex items-center justify-center gap-1 px-3 py-2 bg-teal-100 text-teal-700 rounded-lg hover:bg-teal-200 text-xs xs:text-sm"
        >
          <UserPlusIcon className="w-4 h-4" />
          Adaugă
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-4 xs:space-y-5 md:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl xs:text-2xl md:text-3xl font-bold text-gray-900">Grupele Mele</h1>
          <p className="text-gray-600 mt-1 xs:mt-2 text-xs xs:text-sm md:text-base">Administrează grupele și elevii tăi</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <PlusIcon className="w-5 h-5" />
          Grupă Nouă
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 xs:p-10 md:p-12 text-center">
          <p className="text-gray-500 text-sm xs:text-base">Nu ai grupe asignate încă.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 text-teal-600 hover:text-teal-700 font-medium"
          >
            Creează prima grupă
          </button>
        </div>
      ) : (
        <div className="space-y-6 xs:space-y-8">
          {groupSections.map(section => (
            <div key={section.day} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className={`text-base xs:text-lg font-semibold ${
                  section.isToday ? 'text-teal-700' : section.isTomorrow ? 'text-amber-700' : 'text-gray-800'
                }`}>
                  {section.day}
                </h2>
                {section.isToday && (
                  <span className="px-2 py-0.5 bg-teal-600 text-white text-xs font-medium rounded-full">Azi</span>
                )}
                {section.isTomorrow && (
                  <span className="px-2 py-0.5 bg-amber-500 text-white text-xs font-medium rounded-full">Mâine</span>
                )}
                <span className="text-xs xs:text-sm text-gray-500">
                  ({section.groups.length} {section.groups.length === 1 ? 'grupă' : 'grupe'})
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 xs:gap-4 md:gap-6">
                {section.groups.map(group => renderGroupCard(group))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Grupă Nouă</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 hover:bg-gray-100 rounded text-gray-700"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateGroup} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Nume Grupă *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 placeholder-gray-500"
                  placeholder="Ex: Clasa 9 Luni"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Nivel
                </label>
                <LevelSelect
                  value={formData.level}
                  onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Filială
                </label>
                <select
                  value={formData.branchId}
                  onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                >
                  <option value="">Fără filială</option>
                  {branches?.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Program (selectează zilele și setează ora pentru fiecare)
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {DAYS.map(day => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        formData.scheduleDays.includes(day)
                          ? 'bg-teal-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                {formData.scheduleDays.length > 0 && (
                  <div className="space-y-2 border-t pt-3">
                    {formData.scheduleDays.map(day => (
                      <div key={day} className="flex items-center gap-3">
                        <span className="text-sm text-gray-700 w-24">{day}:</span>
                        <input
                          type="time"
                          value={formData.scheduleTimes[day] || ''}
                          onChange={(e) => updateDayTime(day, e.target.value)}
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    Tip Locație
                  </label>
                  <select
                    value={formData.locationType}
                    onChange={(e) => setFormData({ ...formData, locationType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                  >
                    <option value="offline">Offline</option>
                    <option value="online">Online</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    Data Start
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Sala
                </label>
                <input
                  type="text"
                  value={formData.locationDetails}
                  onChange={(e) => setFormData({ ...formData, locationDetails: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 placeholder-gray-500"
                  placeholder="Ex: Sala 1"
                />
              </div>

              {/* Schedule Display - shows existing groups for selected branch/days */}
              {(formData.branchId || formData.scheduleDays.length > 0) && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                    <h4 className="text-sm font-medium text-gray-900">
                      Orar Existent 
                      {formData.branchId && branches?.find(b => b.id === formData.branchId)?.name && (
                        <span className="text-teal-600"> - {branches.find(b => b.id === formData.branchId).name}</span>
                      )}
                      {formData.scheduleDays.length > 0 && (
                        <span className="text-gray-500"> ({formData.scheduleDays.join(', ')})</span>
                      )}
                    </h4>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {getFilteredScheduleGroups().length === 0 ? (
                      <div className="p-3 text-sm text-gray-500 text-center">
                        Nu există grupe pentru această selecție
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {getFilteredScheduleGroups().map(group => (
                          <div key={group.id} className="p-2 hover:bg-gray-50">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">{group.name}</div>
                                <div className="text-xs text-gray-500">{group.teacher?.name || 'Fără profesor'}</div>
                              </div>
                              <div className="text-right flex-shrink-0 ml-2">
                                <div className="text-xs text-gray-700">
                                  {group.scheduleDays?.length > 0 ? (
                                    group.scheduleDays.map((day, idx) => (
                                      <span key={day}>
                                        {idx > 0 && ', '}
                                        <span className={formData.scheduleDays.includes(day) ? 'font-semibold text-teal-600' : ''}>
                                          {day} {getTimeForDay(group.scheduleTime, day) || ''}
                                        </span>
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-gray-400">Fără program</span>
                                  )}
                                </div>
                                {group.locationDetails && (
                                  <div className="text-xs text-gray-400">{group.locationDetails}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  {creating ? 'Se creează...' : 'Creează Grupa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddStudentModal && selectedGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Adaugă Elev în Grupă</h2>
              <button
                onClick={() => {
                  setShowAddStudentModal(false)
                  setSelectedGroup(null)
                  setSelectedStudentId('')
                }}
                className="p-1 hover:bg-gray-100 rounded text-gray-700"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddStudent} className="p-4 space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-900">{selectedGroup.name}</div>
                <div className="text-sm text-gray-500">{selectedGroup.level}</div>
              </div>

              {loadingStudents ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600"></div>
                </div>
              ) : availableStudents.length === 0 ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                  Nu ai elevi disponibili pentru a adăuga în această grupă. 
                  <Link href="/teacher/students" className="text-amber-700 underline ml-1">
                    Creează elevi noi
                  </Link>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    Selectează Elev *
                  </label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                    required
                  >
                    <option value="">Alege un elev</option>
                    {availableStudents.map(student => (
                      <option key={student.id} value={student.id}>
                        {student.fullName}
                        {student.isCreatedByMe ? ' (creat de mine)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <p className="text-sm text-gray-500">
                Elevul va fi adăugat cu 0 lecții. Poți adăuga lecții ulterior prin înregistrarea unei plăți.
              </p>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddStudentModal(false)
                    setSelectedGroup(null)
                    setSelectedStudentId('')
                  }}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={addingStudent || availableStudents.length === 0 || loadingStudents}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  {addingStudent ? 'Se adaugă...' : 'Adaugă Elev'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
