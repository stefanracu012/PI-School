'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  XCircleIcon,
  FunnelIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Toate' },
  { value: 'completed', label: '✓ Finalizate' },
  { value: 'pending', label: '⏳ În așteptare' },
  { value: 'missed', label: '✗ Neefectuate' },
]

export default function AttendanceHistoryClient({ initialSessions = [], pageSize = 20, hasMoreInitial = false }) {
  const [sessions, setSessions] = useState(initialSessions)
  const [hasMore, setHasMore] = useState(hasMoreInitial)
  const [loadingMore, setLoadingMore] = useState(false)

  const [groupId, setGroupId] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/teacher/attendance/history?skip=${sessions.length}&take=${pageSize}`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setSessions(prev => [...prev, ...(data.sessions || [])])
      setHasMore(!!data.hasMore)
    } catch (e) {
      toast.error('Nu s-au putut încărca mai multe sesiuni')
    } finally {
      setLoadingMore(false)
    }
  }

  // Pre-process sessions with derived fields
  const enriched = useMemo(() => {
    const now = Date.now()
    return sessions.map(s => {
      const presentCount = s.attendances.filter(a => a.status === 'PRESENT').length
      const absentCount = s.attendances.filter(a => a.status === 'ABSENT').length
      const sessDate = new Date(s.date)
      const endOfDay = new Date(sessDate)
      endOfDay.setHours(23, 59, 59, 999)
      const isPastDue = !s.lessonsDeducted && now > endOfDay.getTime()
      let derivedStatus
      if (s.lessonsDeducted) derivedStatus = 'completed'
      else if (isPastDue) derivedStatus = 'missed'
      else derivedStatus = 'pending'
      return { ...s, presentCount, absentCount, derivedStatus }
    })
  }, [sessions])

  // Distinct groups for the dropdown
  const groups = useMemo(() => {
    const map = new Map()
    enriched.forEach(s => {
      if (!map.has(s.groupId)) map.set(s.groupId, { id: s.groupId, name: s.group.name })
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ro'))
  }, [enriched])

  // Apply filters
  const filtered = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null
    const toTs = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : null
    const q = search.trim().toLowerCase()
    return enriched.filter(s => {
      if (groupId !== 'all' && s.groupId !== groupId) return false
      if (statusFilter !== 'all' && s.derivedStatus !== statusFilter) return false
      const ts = new Date(s.date).getTime()
      if (fromTs != null && ts < fromTs) return false
      if (toTs != null && ts > toTs) return false
      if (q) {
        const haystack = `${s.group?.name || ''} ${s.group?.level || ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [enriched, groupId, statusFilter, dateFrom, dateTo, search])

  // Group sessions by date label
  const grouped = useMemo(() => {
    const groups = []
    let current = null
    for (const s of filtered) {
      const label = new Date(s.date).toLocaleDateString('ro-RO', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
      if (!current || current.label !== label) {
        current = { label, items: [] }
        groups.push(current)
      }
      current.items.push(s)
    }
    return groups
  }, [filtered])

  // Totals
  const totals = useMemo(() => {
    let totalPresent = 0, totalAbsent = 0
    let completed = 0, pending = 0, missed = 0
    for (const s of filtered) {
      totalPresent += s.presentCount
      totalAbsent += s.absentCount
      if (s.derivedStatus === 'completed') completed++
      else if (s.derivedStatus === 'pending') pending++
      else missed++
    }
    return { totalPresent, totalAbsent, completed, pending, missed }
  }, [filtered])

  const hasActiveFilters = groupId !== 'all' || statusFilter !== 'all' || dateFrom || dateTo || search

  const clearFilters = () => {
    setGroupId('all')
    setStatusFilter('all')
    setDateFrom('')
    setDateTo('')
    setSearch('')
  }

  return (
    <div className="space-y-3 xs:space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-3 xs:px-4 py-2.5 xs:py-3 border-b border-gray-100 flex items-center justify-between gap-2">
          <button
            onClick={() => setShowFilters(v => !v)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-teal-600"
          >
            <FunnelIcon className="w-4 h-4" />
            Filtre
            {hasActiveFilters && (
              <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-teal-600 text-white rounded-full">
                {[groupId !== 'all', statusFilter !== 'all', !!dateFrom, !!dateTo, !!search].filter(Boolean).length}
              </span>
            )}
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
              Resetează
            </button>
          )}
        </div>

        {showFilters && (
          <div className="p-3 xs:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-[11px] font-medium text-gray-600 mb-1">Caută</label>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Grupă sau nivel..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>

            {/* Group */}
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">Grupa</label>
              <select
                value={groupId}
                onChange={e => setGroupId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
              >
                <option value="all">Toate grupele ({groups.length})</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">De la</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Până la</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 xs:gap-3">
        <StatPill label="Sesiuni" value={filtered.length} color="teal" />
        <StatPill label="Prezente" value={totals.totalPresent} color="green" />
        <StatPill label="Absențe" value={totals.totalAbsent} color="red" />
        <StatPill label="Finalizate" value={totals.completed} color="green" />
        <StatPill label="Neefectuate" value={totals.missed} color="red" />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-gray-500 text-sm">
            {hasActiveFilters ? 'Nicio sesiune nu corespunde filtrelor.' : 'Nu sunt sesiuni înregistrate.'}
          </p>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="mt-3 text-teal-600 hover:text-teal-700 text-sm font-medium">
              Resetează filtrele
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(group => (
            <div key={group.label}>
              <h3 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {group.label}
              </h3>
              <div className="space-y-2 xs:space-y-2.5">
                {group.items.map(sess => (
                  <SessionCard key={sess.id} sess={sess} />
                ))}
              </div>
            </div>
          ))}

          {/* Load more */}
          <div className="pt-2 flex flex-col items-center gap-2">
            {hasMore ? (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-teal-200 text-teal-700 rounded-lg text-sm font-medium hover:bg-teal-50 transition-colors disabled:opacity-60 shadow-sm"
              >
                {loadingMore ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    Se încarcă...
                  </>
                ) : (
                  <>Încarcă mai multe ({pageSize})</>
                )}
              </button>
            ) : sessions.length > 0 ? (
              <p className="text-xs text-gray-400">— Toate sesiunile au fost încărcate ({sessions.length}) —</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function StatPill({ label, value, color }) {
  const colors = {
    teal: 'bg-teal-50 text-teal-700 border-teal-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    red: 'bg-red-50 text-red-700 border-red-100',
  }
  return (
    <div className={`rounded-lg border px-3 py-2 ${colors[color] || colors.teal}`}>
      <p className="text-[10px] xs:text-[11px] uppercase tracking-wide opacity-75">{label}</p>
      <p className="text-base xs:text-lg font-bold">{value}</p>
    </div>
  )
}

function SessionCard({ sess }) {
  const statusBadge =
    sess.derivedStatus === 'completed' ? (
      <span className="px-2 py-1 bg-green-100 text-green-700 text-[10px] xs:text-xs font-medium rounded-lg">✓ Finalizat</span>
    ) : sess.derivedStatus === 'missed' ? (
      <span className="px-2 py-1 bg-red-100 text-red-700 text-[10px] xs:text-xs font-medium rounded-lg">✗ Neefectuat</span>
    ) : (
      <span className="px-2 py-1 bg-amber-100 text-amber-700 text-[10px] xs:text-xs font-medium rounded-lg">⏳ În așteptare</span>
    )

  return (
    <Link
      href={`/teacher/groups/${sess.groupId}/session/${sess.id}`}
      className="block bg-white rounded-xl shadow-sm border border-gray-100 p-3 xs:p-4 hover:shadow-md hover:border-teal-200 transition-all"
    >
      <div className="flex items-center gap-3 xs:gap-4">
        <div className="p-2 xs:p-2.5 bg-teal-100 rounded-lg flex-shrink-0">
          <CalendarDaysIcon className="w-4 h-4 xs:w-5 xs:h-5 text-teal-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 text-sm xs:text-base truncate">{sess.group.name}</p>
          <p className="text-[11px] xs:text-xs text-gray-500 truncate">
            {sess.group.level}
            {' • '}
            {new Date(sess.date).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 xs:gap-2 flex-shrink-0">
          <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded-lg">
            <CheckCircleIcon className="w-3.5 h-3.5 text-green-600" />
            <span className="text-xs font-medium text-green-700">{sess.presentCount}</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 bg-red-50 rounded-lg">
            <XCircleIcon className="w-3.5 h-3.5 text-red-600" />
            <span className="text-xs font-medium text-red-700">{sess.absentCount}</span>
          </div>
          {statusBadge}
        </div>
      </div>
    </Link>
  )
}
