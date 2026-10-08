'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePermissions } from '@/hooks/usePermissions'

// Mapare zi săptămână JS -> română
const dayMapping = {
  0: 'Duminică',
  1: 'Luni',
  2: 'Marți',
  3: 'Miercuri',
  4: 'Joi',
  5: 'Vineri',
  6: 'Sâmbătă'
}

const allDays = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică']

// Sortează zilele începând de la ziua curentă
const getSortedDays = () => {
  const today = new Date().getDay() // 0 = Duminică, 1 = Luni, etc.
  const todayName = dayMapping[today]
  const todayIndex = allDays.indexOf(todayName)
  
  // Reordonează zilele să înceapă cu azi
  return [...allDays.slice(todayIndex), ...allDays.slice(0, todayIndex)]
}

// Parse scheduleTime pentru a obține ora pentru o zi specifică
const getTimeForDay = (scheduleTime, day) => {
  if (!scheduleTime) return null
  try {
    const parsed = JSON.parse(scheduleTime)
    if (typeof parsed === 'object') return parsed[day] || null
  } catch {
    // E string simplu - aceeași oră pentru toate zilele
    return scheduleTime
  }
  return null
}

// Culoare stabilă per grupă, ca aceeași grupă să arate la fel în toată grila
const GROUP_COLORS = [
  '#dbeafe', '#dcfce7', '#fef3c7', '#fee2e2', '#ede9fe',
  '#cffafe', '#fce7f3', '#e0e7ff', '#d1fae5', '#ffedd5',
]

function groupColor(name) {
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 997
  return GROUP_COLORS[hash % GROUP_COLORS.length]
}

export default function OrarPage() {
  const router = useRouter()
  const { hasPermission, isSuperAdmin } = usePermissions()
  
  const [groups, setGroups] = useState([])
  const [branches, setBranches] = useState([])
  const [teachers, setTeachers] = useState([])
  const [makeupLessons, setMakeupLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('list') // 'list' | 'grid'
  
  // Filtre
  const [selectedBranch, setSelectedBranch] = useState('')
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [selectedDay, setSelectedDay] = useState('')
  const [studentSearch, setStudentSearch] = useState('')

  // Verifică permisiunea
  useEffect(() => {
    if (!hasPermission('schedule.view') && !isSuperAdmin) {
      router.push('/admin')
    }
  }, [hasPermission, isSuperAdmin, router])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      // Orarul are nevoie de toate grupele în curs, nu de prima pagină de 20:
      // altfel lipsesc din orar grupe care chiar au lecții.
      const res = await fetch('/api/admin/groups?all=true')
      const data = await res.json()
      setGroups(data.groups || [])
      setBranches(data.branches || [])
      setTeachers(data.teachers || [])
      setMakeupLessons(data.makeupLessons || [])
    } catch (error) {
      console.error('Error fetching groups:', error)
    } finally {
      setLoading(false)
    }
  }

  // Generează orarul sortat pe zile (azi, mâine, etc.)
  const schedule = useMemo(() => {
    const sortedDays = getSortedDays()
    const todayName = dayMapping[new Date().getDay()]
    const tomorrowIndex = (new Date().getDay() + 1) % 7
    const tomorrowName = dayMapping[tomorrowIndex]
    
    const scheduleByDay = {}
    
    sortedDays.forEach(day => {
      scheduleByDay[day] = []
    })
    
    // Filtrăm grupele active
    let activeGroups = groups.filter(g => g.active)
    
    // Filtru profesor
    if (selectedTeacher) {
      activeGroups = activeGroups.filter(g => g.teacherId === selectedTeacher)
    }
    
    // Filtru student (caută în lista de studenți din grupă)
    if (studentSearch.trim()) {
      const searchLower = studentSearch.toLowerCase().trim()
      activeGroups = activeGroups.filter(group => {
        if (!group.groupStudents || group.groupStudents.length === 0) return false
        return group.groupStudents.some(gs => 
          gs.student?.fullName?.toLowerCase().includes(searchLower) ||
          gs.student?.parentName?.toLowerCase().includes(searchLower) ||
          gs.student?.parentPhone?.includes(searchLower)
        )
      })
    }
    
    // Populăm orarul
    activeGroups.forEach(group => {
      if (!group.scheduleDays) return
      
      // Filtru filială
      if (selectedBranch) {
        if (selectedBranch === 'none' && group.branchId) return
        if (selectedBranch !== 'none' && group.branchId !== selectedBranch) return
      }
      
      group.scheduleDays.forEach(day => {
        // Filtru zi specifică
        if (selectedDay && day !== selectedDay) return
        
        if (scheduleByDay[day]) {
          const time = getTimeForDay(group.scheduleTime, day)
          scheduleByDay[day].push({
            id: group.id,
            name: group.name,
            time: time || '-',
            branch: group.branch?.name || '-',
            teacherName: group.teacher?.name || '-',
            teacherEmail: group.teacher?.email || '-',
            teacherPhone: group.teacher?.phone || null,
            room: group.locationDetails || '-',
            locationType: group.locationType,
            level: group.level || '-',
            studentCount: group.groupStudents?.length || 0
          })
        }
      })
    })
    
    // Sortăm fiecare zi după oră
    Object.keys(scheduleByDay).forEach(day => {
      scheduleByDay[day].sort((a, b) => {
        if (!a.time || a.time === '-') return 1
        if (!b.time || b.time === '-') return -1
        return a.time.localeCompare(b.time)
      })
    })
    
    // Adăugăm lecțiile de recuperare programate
    makeupLessons.forEach(makeup => {
      if (!makeup.scheduledAt) return
      
      const scheduledDate = new Date(makeup.scheduledAt)
      const makeupDayName = dayMapping[scheduledDate.getDay()]
      
      // Filtru profesor
      if (selectedTeacher && makeup.teacherId !== selectedTeacher) return
      
      // Filtru filială
      if (selectedBranch) {
        if (selectedBranch === 'none' && makeup.branchId) return
        if (selectedBranch !== 'none' && makeup.branchId !== selectedBranch) return
      }
      
      // Filtru zi
      if (selectedDay && makeupDayName !== selectedDay) return
      
      // Filtru student
      if (studentSearch.trim()) {
        const searchLower = studentSearch.toLowerCase().trim()
        const hasMatchingStudent = makeup.students?.some(ms => 
          ms.student?.fullName?.toLowerCase().includes(searchLower)
        )
        if (!hasMatchingStudent) return
      }
      
      // Extract time from UTC date
      const hours = scheduledDate.getUTCHours().toString().padStart(2, '0')
      const minutes = scheduledDate.getUTCMinutes().toString().padStart(2, '0')
      const timeStr = `${hours}:${minutes}`
      
      // Format date for display
      const dateStr = scheduledDate.toLocaleDateString('ro-RO', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC'
      })
      
      if (scheduleByDay[makeupDayName]) {
        scheduleByDay[makeupDayName].push({
          id: makeup.id,
          name: makeup.group?.name || 'Recuperare',
          time: timeStr,
          isMakeup: true,
          branch: makeup.branch?.name || '-',
          teacherName: makeup.teacher?.name || '-',
          teacherEmail: makeup.teacher?.email || '-',
          teacherPhone: makeup.teacher?.phone || null,
          room: makeup.locationDetails || '-',
          locationType: 'offline',
          level: makeup.group?.name ? 'Lecție de recuperare' : '-',
          studentCount: makeup.students?.length || 0,
          isMakeup: true,
          makeupDate: dateStr,
          makeupStatus: makeup.status,
          groupId: makeup.groupId
        })
        
        // Re-sortăm ziua
        scheduleByDay[makeupDayName].sort((a, b) => {
          if (!a.time || a.time === '-') return 1
          if (!b.time || b.time === '-') return -1
          return a.time.localeCompare(b.time)
        })
      }
    })
    
    return { scheduleByDay, todayName, tomorrowName, sortedDays }
  }, [groups, makeupLessons, selectedBranch, selectedTeacher, selectedDay, studentSearch])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  const hasActiveFilters = selectedBranch || selectedTeacher || selectedDay || studentSearch
  const resetFilters = () => {
    setSelectedBranch('')
    setSelectedTeacher('')
    setSelectedDay('')
    setStudentSearch('')
  }

  // Calculează statistici
  const totalLessons = schedule.sortedDays.reduce((sum, day) => sum + schedule.scheduleByDay[day].length, 0)

  // Grila are atâtea rânduri câte lecții are ziua cea mai încărcată
  const gridRowCount = schedule.sortedDays.reduce(
    (max, day) => Math.max(max, schedule.scheduleByDay[day].length), 0
  )

  return (
    <div className="space-y-4 xs:space-y-6">
      <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-0">
        <div>
          <h1 className="text-xl xs:text-2xl font-bold text-gray-900">Orar</h1>
          <p className="text-sm xs:text-base text-gray-600">Vizualizează orarul tuturor grupelor</p>
        </div>

        {/* Aceleași date, două forme: listă pe zile sau tabel săptămânal */}
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden self-start">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Listă
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Tabel săptămânal
          </button>
        </div>
      </div>
        
      {/* Panoul de filtre */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Filtru filială */}
          {branches.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Filială</label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Toate filialele</option>
                <option value="none">Fără filială</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Filtru profesor */}
          {teachers.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Profesor</label>
              <select
                value={selectedTeacher}
                onChange={(e) => setSelectedTeacher(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Toți profesorii</option>
                {teachers.map(teacher => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Filtru zi */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Zi</label>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Toate zilele</option>
              {allDays.map(day => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </div>

          {/* Search elevi */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Caută elev</label>
            <input
              type="text"
              placeholder="Nume elev sau părinte..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* Buton resetare și statistici */}
        {hasActiveFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
            <button
              onClick={resetFilters}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Resetează filtrele
            </button>
            <span className="text-sm text-gray-600">
              {totalLessons} {totalLessons === 1 ? 'lecție' : 'lecții'} găsite
            </span>
          </div>
        )}
      </div>

      {/* Tabel săptămânal, în forma folosită pe hârtie: TIME | ZI, pentru fiecare zi */}
      {viewMode === 'grid' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                {schedule.sortedDays.map((day) => (
                  <th key={day} colSpan={2} className={`px-2 py-2 border border-gray-200 text-center text-xs font-bold uppercase tracking-wide ${
                    day === schedule.todayName ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {day}
                  </th>
                ))}
              </tr>
              <tr>
                {schedule.sortedDays.map((day) => (
                  <Fragment key={`h-${day}`}>
                    <th className="px-2 py-1 border border-gray-200 bg-gray-50 text-[10px] font-medium text-gray-500 uppercase">Ora</th>
                    <th className="px-2 py-1 border border-gray-200 bg-gray-50 text-[10px] font-medium text-gray-500 uppercase">Grupa</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: gridRowCount }, (_, row) => (
                <tr key={row}>
                  {schedule.sortedDays.map((day) => {
                    const item = schedule.scheduleByDay[day][row]
                    if (!item) {
                      return (
                        <Fragment key={`${day}-${row}`}>
                          <td className="border border-gray-200 px-2 py-1.5" />
                          <td className="border border-gray-200 px-2 py-1.5" />
                        </Fragment>
                      )
                    }
                    return (
                      <Fragment key={`${day}-${row}`}>
                        <td className="border border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-800 whitespace-nowrap text-center">
                          {item.time}
                        </td>
                        <td
                          className="border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-900 whitespace-nowrap"
                          style={{ backgroundColor: groupColor(item.name) }}
                          title={`${item.name} · ${item.teacherName} · ${item.room}`}
                        >
                          {item.name}
                          {item.isMakeup && <span className="ml-1 text-[10px] text-amber-700">(rec.)</span>}
                          <span className="block text-[10px] font-normal text-gray-600">
                            {item.teacherName}
                            {item.studentCount ? ` · ${item.studentCount} elevi` : ''}
                          </span>
                        </td>
                      </Fragment>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {gridRowCount === 0 && (
            <p className="p-6 text-center text-sm text-gray-500">Nicio lecție programată.</p>
          )}
        </div>
      )}

      {/* Orar pe zile */}
      <div className={viewMode === 'grid' ? 'hidden' : 'space-y-6'}>
        {schedule.sortedDays.map((day) => {
          const daySchedule = schedule.scheduleByDay[day]
          const isToday = day === schedule.todayName
          const isTomorrow = day === schedule.tomorrowName
          
          if (daySchedule.length === 0) return null
          
          return (
            <div key={day} className="space-y-3">
              {/* Header zi */}
              <div className="flex items-center gap-2">
                <h2 className={`text-lg font-semibold ${
                  isToday ? 'text-indigo-700' : isTomorrow ? 'text-amber-700' : 'text-gray-800'
                }`}>
                  {day}
                </h2>
                {isToday && (
                  <span className="px-2 py-0.5 bg-indigo-600 text-white text-xs font-medium rounded-full">
                    Azi
                  </span>
                )}
                {isTomorrow && (
                  <span className="px-2 py-0.5 bg-amber-500 text-white text-xs font-medium rounded-full">
                    Mâine
                  </span>
                )}
                <span className="text-sm text-gray-500">
                  ({daySchedule.length} {daySchedule.length === 1 ? 'grupă' : 'grupe'})
                </span>
              </div>

              {/* Card-uri */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {daySchedule.map((item, idx) => (
                  <Link 
                    key={`${item.id}-${idx}`} 
                    href={item.isMakeup ? `/admin/makeup` : `/admin/groups/${item.id}/students`}
                    className={`block bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition-all hover:scale-[1.01] cursor-pointer ${
                      item.isMakeup 
                        ? 'border-amber-200 hover:border-amber-300 bg-amber-50/30' 
                        : isToday 
                          ? 'border-indigo-200 hover:border-indigo-300' 
                          : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    {/* Header card - oră și filială */}
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-xl font-bold ${item.isMakeup ? 'text-amber-600' : 'text-indigo-600'}`}>
                        {item.time}
                      </span>
                      <div className="flex items-center gap-2">
                        {item.isMakeup && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            {item.makeupDate}
                          </span>
                        )}
                        {item.branch !== '-' && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            {item.branch}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Numele grupei */}
                    <h3 className="font-semibold text-gray-900 mb-1">{item.name}</h3>
                    <p className="text-xs text-gray-500 mb-3">{item.level}</p>

                    {/* Număr elevi */}
                    {item.studentCount > 0 && (
                      <div className="mb-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                          </svg>
                          {item.studentCount} {item.studentCount === 1 ? 'elev' : 'elevi'}
                        </span>
                      </div>
                    )}

                    {/* Profesor - cu telefon și email */}
                    <div className="space-y-1.5 mb-3 p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">{item.teacherName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span
                          className="text-xs text-indigo-600 hover:underline truncate cursor-pointer"
                          onClick={e => { e.preventDefault(); e.stopPropagation(); window.location.href = `mailto:${item.teacherEmail}` }}
                        >
                          {item.teacherEmail}
                        </span>
                      </div>
                      {item.teacherPhone && (
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span
                            className="text-xs text-indigo-600 hover:underline cursor-pointer"
                            onClick={e => { e.preventDefault(); e.stopPropagation(); window.location.href = `tel:${item.teacherPhone}` }}
                          >
                            {item.teacherPhone}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Locație */}
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      {item.locationType === 'online' ? (
                        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                      <span className="truncate">{item.room}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
        
        {/* Mesaj dacă nu sunt grupe */}
        {schedule.sortedDays.every(day => schedule.scheduleByDay[day].length === 0) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 xs:p-12 text-center">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-500">
              {hasActiveFilters ? 
                'Nu există grupe care să corespundă filtrelor selectate.' : 
                'Nu există grupe programate.'
              }
            </p>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="mt-4 px-4 py-2 text-sm text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
              >
                Resetează filtrele
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
