'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DeleteGroupButton from '@/components/admin/DeleteGroupButton'
import AdminStartSessionButton from '@/components/admin/AdminStartSessionButton'
import { usePermissions } from '@/hooks/usePermissions'
import { getDaysFromToday, getTodayName, getTomorrowName, nearestDay, getTimeForDay } from '@/lib/scheduleDays'

// Helper pentru a formata orarul
const formatSchedule = (scheduleDays, scheduleTime) => {
  if (!scheduleDays || scheduleDays.length === 0) return null
  
  // Încearcă să parseze JSON (ore diferite per zi)
  let times = {}
  try {
    if (scheduleTime) {
      times = JSON.parse(scheduleTime)
    }
  } catch {
    // E string simplu - aceeași oră pentru toate zilele
  }
  
  // Verifică dacă toate orele sunt identice
  const uniqueTimes = [...new Set(Object.values(times))]
  const isSimple = typeof scheduleTime === 'string' && !scheduleTime.startsWith('{')
  
  if (isSimple || uniqueTimes.length <= 1) {
    // Format simplu: "Luni, Miercuri la 16:00"
    const time = isSimple ? scheduleTime : (uniqueTimes[0] || '')
    return `${scheduleDays.join(', ')}${time ? ` la ${time}` : ''}`
  }
  
  // Format detaliat: "Luni 16:00, Miercuri 18:00"
  return scheduleDays.map(day => `${day} ${times[day] || ''}`).join(', ')
}

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

export default function GroupsPage() {
  const router = useRouter()
  const { hasPermission, isSuperAdmin } = usePermissions()
  
  // Permisiuni
  const canViewGroups = hasPermission('groups.view')
  const canCreateGroups = hasPermission('groups.create')
  const canEditGroups = hasPermission('groups.edit')
  const canDeleteGroups = hasPermission('groups.delete')
  const canViewStudents = hasPermission('groups.students.view')

  const [groups, setGroups] = useState([])
  const [teachers, setTeachers] = useState([])
  const [branches, setBranches] = useState([])
  // loading = doar prima încărcare (schelet pe toată pagina)
  // refreshing = refetch la filtrare (păstrează pagina și focusul pe input)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const isFirstLoad = useRef(true)
  const requestId = useRef(0)

  // Filtre
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [selectedDay, setSelectedDay] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [dateFilter, setDateFilter] = useState('all') // 'all', 'today', 'custom'
  // 'active' (implicit) = grupele în curs, 'completed' = cele încheiate
  const [groupStatus, setGroupStatus] = useState('active')
  const [customDate, setCustomDate] = useState('')

  // Verifică permisiunea
  useEffect(() => {
    if (!canViewGroups && !isSuperAdmin) {
      router.push('/admin')
    }
  }, [canViewGroups, isSuperAdmin, router])

  useEffect(() => {
    fetchData()
  }, [debouncedSearch, selectedTeacher, selectedBranch, selectedDay, groupStatus])

  const fetchData = async () => {
    // Doar prima încărcare înlocuiește pagina cu spinner-ul;
    // filtrările ulterioare doar estompează lista, ca să nu se piardă focusul din input
    if (isFirstLoad.current) setLoading(true)
    else setRefreshing(true)

    const reqId = ++requestId.current

    try {
      const params = new URLSearchParams()
      // Luăm toate grupele care corespund filtrelor (nu paginat): altfel
      // gruparea pe zile ar arăta doar o felie arbitrară din rezultate.
      params.set('all', 'true')
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (selectedTeacher) params.set('teacherId', selectedTeacher)
      if (selectedBranch) params.set('branchId', selectedBranch)
      if (selectedDay) params.set('day', selectedDay)
      params.set('status', groupStatus)

      const res = await fetch(`/api/admin/groups?${params.toString()}`)
      const data = await res.json()

      // Ignoră răspunsurile venite peste rând (o cerere mai nouă a pornit între timp)
      if (reqId !== requestId.current) return

      setGroups(data.groups || [])
      setTeachers(data.teachers || [])
      setBranches(data.branches || [])
    } catch (error) {
      console.error('Error fetching groups:', error)
    } finally {
      if (reqId === requestId.current) {
        isFirstLoad.current = false
        setLoading(false)
        setRefreshing(false)
      }
    }
  }

  // Filtrare locală pentru dateFilter (azi/custom)
  const filteredGroups = groups.filter(group => {
    if (dateFilter === 'today') {
      const today = dayMapping[new Date().getDay()]
      if (!group.scheduleDays || !group.scheduleDays.includes(today)) {
        return false
      }
    } else if (dateFilter === 'custom' && customDate) {
      const selectedDate = new Date(customDate)
      const dayName = dayMapping[selectedDate.getDay()]
      if (!group.scheduleDays || !group.scheduleDays.includes(dayName)) {
        return false
      }
    }
    return true
  })

  const resetFilters = () => {
    setSearchQuery('')
    setDebouncedSearch('')
    setSelectedTeacher('')
    setSelectedBranch('')
    setSelectedDay('')
    setDateFilter('all')
    setCustomDate('')
  }

  const hasActiveFilters = searchQuery || selectedTeacher || selectedBranch || selectedDay ||
    dateFilter !== 'all' || groupStatus !== 'active'

  // Debounce search: cererea pleacă abia după ce te oprești din tastat
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 350)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Zi specifică vizată de filtre (fie aleasă direct, fie prin "Azi"/dată custom)
  const effectiveDayName = selectedDay
    || (dateFilter === 'today' ? dayMapping[new Date().getDay()] : '')
    || (dateFilter === 'custom' && customDate ? dayMapping[new Date(customDate).getDay()] : '')

  // Grupele, ordonate ca la /orar: azi, mâine, apoi restul zilelor.
  // Dacă e activ un filtru de zi specifică, arătăm o singură secțiune pentru acea zi.
  const groupSections = useMemo(() => {
    const todayName = getTodayName()
    const tomorrowName = getTomorrowName()

    if (effectiveDayName) {
      return [{
        day: effectiveDayName,
        isToday: effectiveDayName === todayName,
        isTomorrow: effectiveDayName === tomorrowName,
        groups: filteredGroups,
      }]
    }

    const orderedDays = getDaysFromToday()
    const buckets = {}
    orderedDays.forEach(d => { buckets[d] = [] })
    const noSchedule = []

    filteredGroups.forEach(group => {
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
  }, [filteredGroups, effectiveDayName])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4 xs:space-y-6">
      <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-0">
        <div>
          <h1 className="text-xl xs:text-2xl font-bold text-gray-900">Grupe</h1>
          <p className="text-sm xs:text-base text-gray-600">Gestionează grupele de studiu</p>
        </div>
        {canCreateGroups && (
        <Link
          href="/admin/groups/new"
          className="px-3 xs:px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm xs:text-base font-medium hover:bg-indigo-700 transition-colors text-center"
        >
          + Adaugă grupă
        </Link>
        )}
      </div>

      {/* Filtre */}
      <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-3 xs:p-4">
        <div className="flex flex-col gap-3 xs:gap-4">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Caută după elev, profesor, grupă, nivel, filială, zi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-gray-700 w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Filtre dropdown */}
          <div className="flex flex-wrap gap-2 xs:gap-3">
            {/* Filială */}
            {branches.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Filială</label>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[130px]"
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

            {/* Profesor */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Profesor</label>
              <select
                value={selectedTeacher}
                onChange={(e) => setSelectedTeacher(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[150px]"
              >
                <option value="">Toți profesorii</option>
                {teachers.map(teacher => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name || teacher.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Zi */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Zi săptămână</label>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[130px]"
              >
                <option value="">Toate zilele</option>
                {allDays.map(day => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>

            {/* În curs sau încheiate */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Stare</label>
              <select
                value={groupStatus}
                onChange={(e) => setGroupStatus(e.target.value)}
                className={`px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 min-w-[150px] ${
                  groupStatus === 'completed'
                    ? 'border-amber-400 bg-amber-50 text-amber-900 font-medium'
                    : 'border-gray-300 text-gray-900'
                }`}
              >
                <option value="active">Grupe în curs</option>
                <option value="completed">Grupe terminate</option>
                <option value="all">Toate</option>
              </select>
            </div>

            {/* Filtru dată */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Dată</label>
              <select
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value)
                  if (e.target.value !== 'custom') setCustomDate('')
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[120px]"
              >
                <option value="all">Toate</option>
                <option value="today">Azi ({dayMapping[new Date().getDay()]})</option>
                <option value="custom">Alege data...</option>
              </select>
            </div>

            {/* Data custom */}
            {dateFilter === 'custom' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Data</label>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            )}

            {/* Reset filtre */}
            {hasActiveFilters && (
              <div className="flex items-end">
                <button
                  onClick={resetFilters}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Resetează filtrele
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Info rezultate */}
        {hasActiveFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-sm text-gray-600 flex items-center gap-2">
              {refreshing && <span className="inline-block w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />}
              {filteredGroups.length} {filteredGroups.length === 1 ? 'grupă găsită' : 'grupe găsite'}
              {dateFilter === 'today' && ` pentru azi (${dayMapping[new Date().getDay()]})`}
              {dateFilter === 'custom' && customDate && ` pentru ${new Date(customDate).toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' })}`}
            </p>
          </div>
        )}
      </div>

      <div className={`space-y-6 xs:space-y-8 transition-opacity duration-150 ${refreshing ? 'opacity-50' : 'opacity-100'}`}>
        {filteredGroups.length === 0 ? (
          <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-8 xs:p-12 text-center text-gray-500 text-sm xs:text-base">
            {hasActiveFilters ? 'Nu există grupe care să corespundă filtrelor.' : 'Nu există grupe. Adaugă prima grupă!'}
          </div>
        ) : (
          groupSections.map(section => (
            <div key={section.day} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className={`text-base xs:text-lg font-semibold ${
                  section.isToday ? 'text-indigo-700' : section.isTomorrow ? 'text-amber-700' : 'text-gray-800'
                }`}>
                  {section.day}
                </h2>
                {section.isToday && (
                  <span className="px-2 py-0.5 bg-indigo-600 text-white text-xs font-medium rounded-full">Azi</span>
                )}
                {section.isTomorrow && (
                  <span className="px-2 py-0.5 bg-amber-500 text-white text-xs font-medium rounded-full">Mâine</span>
                )}
                <span className="text-xs xs:text-sm text-gray-500">
                  ({section.groups.length} {section.groups.length === 1 ? 'grupă' : 'grupe'})
                </span>
              </div>
              <div className="grid gap-3 xs:gap-4 md:gap-6 md:grid-cols-2 lg:grid-cols-3">
                {section.groups.map((group) => (
                  <div key={group.id} className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-3 xs:p-4 md:p-6">
                      <div className="flex items-start justify-between gap-2 mb-3 xs:mb-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm xs:text-base md:text-lg font-semibold text-gray-900 truncate">{group.name}</h3>
                          <p className="text-xs xs:text-sm text-indigo-600 truncate">{group.level || '—'}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={`inline-flex items-center px-2 xs:px-2.5 py-0.5 rounded-full text-[10px] xs:text-xs font-medium ${
                            group.completedAt
                              ? 'bg-amber-100 text-amber-800'
                              : group.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {group.completedAt ? 'Terminată' : group.active ? 'Activ' : 'Inactiv'}
                          </span>
                          {group.branch && (
                            <span className="inline-flex items-center px-2 xs:px-2.5 py-0.5 rounded-full text-[10px] xs:text-xs font-medium bg-purple-100 text-purple-800">
                              {group.branch.name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5 xs:space-y-2 text-xs xs:text-sm">
                        <div className="flex items-center gap-1.5 xs:gap-2 text-gray-600">
                          <svg className="w-3.5 h-3.5 xs:w-4 xs:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="truncate">Profesor: {group.teacher?.name || group.teacher?.email || '-'}</span>
                        {group.isTrial && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium">
                            probă{group.trialDate ? ' · ' + new Date(group.trialDate).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) : ''}
                          </span>
                        )}
                        </div>
                        <div className="flex items-center gap-1.5 xs:gap-2 text-gray-600">
                          <svg className="w-3.5 h-3.5 xs:w-4 xs:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>{group.groupStudents?.length || 0} elevi</span>
                        </div>
                        {group.scheduleDays?.length > 0 && (
                          <div className="flex items-start gap-1.5 xs:gap-2 text-gray-600">
                            <svg className="w-3.5 h-3.5 xs:w-4 xs:h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="break-words">{formatSchedule(group.scheduleDays, group.scheduleTime)}</span>
                          </div>
                        )}
                        {group.locationType && (
                          <div className="flex items-center gap-1.5 xs:gap-2 text-gray-600">
                            <svg className="w-3.5 h-3.5 xs:w-4 xs:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            </svg>
                            <span>{group.locationType === 'online' ? 'Online' : 'Offline'}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="px-3 xs:px-4 md:px-6 py-2.5 xs:py-3 bg-gray-50 border-t flex gap-2 xs:gap-3">
                      {canEditGroups && (
                      <Link
                        href={`/admin/groups/${group.id}`}
                        className="text-indigo-600 hover:text-indigo-900 text-xs xs:text-sm font-medium"
                      >
                        Editează
                      </Link>
                      )}
                      {canEditGroups && (
                        <AdminStartSessionButton
                          groupId={group.id}
                          groupName={group.name}
                          teacherName={group.teacher?.name || group.teacher?.email || null}
                          compact
                        />
                      )}
                      {canViewStudents && (
                      <Link
                        href={`/admin/groups/${group.id}/students`}
                        className="text-indigo-600 hover:text-indigo-900 text-xs xs:text-sm font-medium"
                      >
                        Elevi
                      </Link>
                      )}
                      <a
                        href={`/api/admin/groups/${group.id}/export?format=csv`}
                        className="text-emerald-700 hover:text-emerald-900 text-xs xs:text-sm font-medium"
                        title="Descarcă tot istoricul grupei ca CSV"
                      >
                        CSV
                      </a>
                      <a
                        href={`/api/admin/groups/${group.id}/export?format=pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-rose-700 hover:text-rose-900 text-xs xs:text-sm font-medium"
                        title="Deschide istoricul pentru tipar / salvare ca PDF"
                      >
                        PDF
                      </a>
                      {canDeleteGroups && (
                      <DeleteGroupButton id={group.id} name={group.name} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
