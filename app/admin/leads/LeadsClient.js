'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  PhoneIcon, ChatBubbleLeftIcon, InboxIcon, MagnifyingGlassIcon,
  PlusIcon, XMarkIcon, BellAlertIcon, ChevronDownIcon, PencilSquareIcon,
  ArrowTopRightOnSquareIcon, TrashIcon, AcademicCapIcon,
} from '@heroicons/react/24/outline'
import { LEAD_STATUSES, LEAD_SOURCES, getStatus, getSource, statusOptionsFor } from '@/lib/leads-config'
import { PermissionGate } from '@/hooks/usePermissions'
import LeadForm from '@/components/admin/LeadForm'
import FollowUpPicker from '@/components/admin/FollowUpPicker'
import { zonedDateInDays } from '@/lib/timezone'
import { whatsAppLink } from '@/lib/phone'
import { PlatformIcon } from '@/components/icons/BrandIcons'
import { AGE_GROUPS, getAgeGroup } from '@/lib/age-groups'
import { childrenOf } from '@/lib/lead-children'
import { preferenceLabel, LOCATION_TYPES } from '@/lib/lesson-preferences'



const PAGE_SIZES = [25, 50, 100, 'all']

const FOLLOWUPS = [
  { value: '', label: 'Follow-up: toate' },
  { value: 'overdue', label: '🔴 Restante' },
  { value: 'today', label: '🟠 Azi' },
  { value: 'upcoming', label: '🔵 Urmează' },
  { value: 'none', label: '⚪ Fără follow-up' },
]

const SORTS = [
  { value: 'newest', label: 'Cele mai noi' },
  { value: 'oldest', label: 'Cele mai vechi' },
  { value: 'followup', label: 'Follow-up apropiat' },
  { value: 'name', label: 'Nume (A–Z)' },
]

const selectClass =
  'px-2 py-1.5 text-xs text-gray-900 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'

// Un filtru pus se colorează, ca să nu te întrebi de ce lipsesc lead-uri
// din listă.
const activeSelectClass =
  'px-2 py-1.5 text-xs font-semibold text-indigo-800 border border-indigo-400 rounded-lg bg-indigo-50 ring-1 ring-indigo-200 focus:ring-2 focus:ring-indigo-500'

const pick = (active) => (active ? activeSelectClass : selectClass)

// Filtrele rămân puse și după ce închizi pagina
const FILTERS_KEY = 'pischool:leads:filters'

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// Recontactările se verifică din 10 în 10 minute, deci ora se aliniază la
// sferturi de acest fel: 16:00, 16:10, 16:20…
const STEP_MINUTES = 10

const roundToStep = (value) => {
  if (!value) return value
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  d.setMinutes(Math.round(d.getMinutes() / STEP_MINUTES) * STEP_MINUTES, 0, 0)
  return d
}

// Follow-up-ul are și oră; input-ul datetime-local vrea ora locală, nu UTC
const toDateInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const PERIODS = [
  { value: '', label: 'Perioadă: toate' },
  { value: 'today', label: 'Azi' },
  { value: 'yesterday', label: 'Ieri' },
  { value: 'week', label: 'Săptămâna aceasta' },
  { value: 'month', label: 'Luna aceasta' },
  { value: 'prev-month', label: 'Luna trecută' },
  { value: 'interval', label: 'Interval…' },
]

export default function LeadsClient({ leads = [], staff = [] }) {
  const router = useRouter()
  const [items, setItems] = useState(leads)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [serverStats, setServerStats] = useState(null)
  const [serverLevels, setServerLevels] = useState({ levelOptions: [], withoutLevel: 0 })
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [editingLead, setEditingLead] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [search, setSearch] = useState('')

  // Mai multe status-uri în același timp; a doua apăsare pe același îl scoate
  const [statuses, setStatuses] = useState([])
  const [source, setSource] = useState('')
  const [level, setLevel] = useState('')
  const [audience, setAudience] = useState('') // '', 'adult', 'copil'
  const [ageGroup, setAgeGroup] = useState('')
  const [locationType, setLocationType] = useState('')
  const [period, setPeriod] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [sort, setSort] = useState('newest')
  // Până citim filtrele salvate, nu cerem nimic de la server: altfel prima
  // listă ar fi cea nefiltrată și ar clipi.
  const [restored, setRestored] = useState(false)
  // Lead-urile se cer de la server, filtrate și paginate acolo: altfel
  // pagina ar trage toată baza la fiecare deschidere.
  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (statuses.length) params.set('status', statuses.join(','))
    if (source) params.set('source', source)
    if (level) params.set('level', level)
    if (audience) params.set('audience', audience)
    if (ageGroup) params.set('ageGroup', ageGroup)
    if (locationType) params.set('locationType', locationType)
    if (followUp) params.set('followUp', followUp)
    if (sort) params.set('sort', sort)
    if (period === 'interval') {
      if (from) params.set('from', from)
      if (to) params.set('to', to)
    } else if (period) {
      params.set('period', period)
    }
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    return params
  }, [statuses, source, level, audience, ageGroup, locationType, followUp, sort, period, from, to, page, pageSize])

  const fetchLeads = useCallback(async (searchTerm) => {
    setLoading(true)
    try {
      const params = new URLSearchParams(query)
      if (searchTerm?.trim()) params.set('q', searchTerm.trim())

      const res = await fetch(`/api/admin/leads?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare la citirea lead-urilor')

      setItems(data.leads || [])
      setTotalCount(data.totalCount ?? 0)
      setTotalPages(data.totalPages ?? 1)
      setServerStats(data.stats || null)
      setServerLevels({
        levelOptions: data.levelOptions || [],
        withoutLevel: data.withoutLevel || 0,
      })
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [query])

  // Filtrele puse rămân puse: le luăm din browser la deschidere
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || 'null')
      if (saved) {
        if (Array.isArray(saved.statuses)) setStatuses(saved.statuses)
        if (saved.source) setSource(saved.source)
        if (saved.level) setLevel(saved.level)
        if (saved.audience) setAudience(saved.audience)
        if (saved.ageGroup) setAgeGroup(saved.ageGroup)
        if (saved.locationType) setLocationType(saved.locationType)
        if (saved.followUp) setFollowUp(saved.followUp)
        if (PERIODS.some((p) => p.value === saved.period)) setPeriod(saved.period)
        if (saved.from) setFrom(saved.from)
        if (saved.to) setTo(saved.to)
        if (saved.sort) setSort(saved.sort)
        if (saved.pageSize) setPageSize(saved.pageSize)
      }
    } catch {}
    setRestored(true)
  }, [])

  // …și se scriu înapoi la fiecare schimbare
  useEffect(() => {
    if (!restored) return
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({
        statuses, source, level, audience, ageGroup, locationType, followUp, period, from, to, sort, pageSize,
      }))
    } catch {}
  }, [restored, statuses, source, level, audience, ageGroup, locationType, followUp, period, from, to, sort, pageSize])

  // Filtrele se aplică imediat; scrisul în căutare, după o pauză
  useEffect(() => {
    if (!restored) return
    const timer = setTimeout(() => fetchLeads(search), search ? 350 : 0)
    return () => clearTimeout(timer)
  }, [restored, fetchLeads, search])

  // Orice filtru nou readuce lista la prima pagină
  useEffect(() => {
    setPage(1)
  }, [statuses, source, level, audience, ageGroup, locationType, followUp, period, from, to, search, pageSize])

  const resetPaging = () => setPage(1)

  const toggleStatus = (value) => {
    setStatuses((prev) => (prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]))
    resetPaging()
  }

  const resetAll = () => {
    setSearch(''); setStatuses([]); setSource(''); setLevel(''); setAudience(''); setAgeGroup('')
    setLocationType('')
    setPeriod(''); setFrom(''); setTo(''); setFollowUp(''); setSort('newest'); resetPaging()
    try { localStorage.removeItem(FILTERS_KEY) } catch {}
  }

  const activeFilterCount =
    (search ? 1 : 0) + statuses.length +
    (source ? 1 : 0) + (level ? 1 : 0) + (audience ? 1 : 0) + (ageGroup ? 1 : 0) +
    (locationType ? 1 : 0) +
    (period ? 1 : 0) + (followUp ? 1 : 0)

  // Actualizează un lead în listă după o modificare din rândul extins
  const patchLead = useCallback((id, patch) => {
    setItems((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }, [])

  // Cine se ocupă de lead — poate fi schimbat direct din listă
  const assignLead = useCallback(async (lead, userId) => {
    const previous = lead.assignedToId
    setItems((prev) => prev.map((l) => (l.id === lead.id ? { ...l, assignedToId: userId || null } : l)))
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: userId || null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Eroare la atribuire")
      }
      toast.success(userId ? "Responsabil setat" : "Responsabil eliminat")
    } catch (err) {
      toast.error(err.message)
      setItems((prev) => prev.map((l) => (l.id === lead.id ? { ...l, assignedToId: previous } : l)))
    }
  }, [])

  // Schimbarea statusului direct din listă, fără a deschide formularul
  const changeStatus = useCallback(async (lead, newStatus) => {
    const previous = lead.status
    setItems((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: newStatus } : l)))
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Eroare la schimbarea statusului")
      if (data.conversion?.created) {
        toast.success(
          data.conversion.count > 1
            ? `${data.conversion.count} elevi au fost adăugați în lista de elevi`
            : "Elevul a fost adăugat în lista de elevi"
        )
      }
    } catch (err) {
      toast.error(err.message)
      setItems((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: previous } : l)))
    }
  }, [])

  const deleteLead = useCallback(async (lead) => {
    if (!confirm(`Ștergi lead-ul „${lead.name}"? Notițele lui se pierd definitiv.`)) return
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Eroare la ștergere")
      }
      setItems((prev) => prev.filter((l) => l.id !== lead.id))
      toast.success("Lead șters")
    } catch (err) {
      toast.error(err.message)
    }
  }, [])

  // Cifrele de sus vin de la server: se numără pe toate lead-urile, nu doar
  // pe pagina de față.
  const stats = serverStats || { total: 0, byStatus: {}, overdue: 0 }

  // Lista vine gata filtrată și sortată de la server
  const displayed = items

  // 1 … 4 5 [6] 7 8 … 20 — numai atâtea butoane câte încap cu ochiul
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const out = [1]
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)
    if (start > 2) out.push('…')
    for (let i = start; i <= end; i++) out.push(i)
    if (end < totalPages - 1) out.push('…')
    out.push(totalPages)
    return out
  }, [page, totalPages])

  // Nivelurile care chiar apar în lead-uri, numărate pe toată baza
  const levelOptions = useMemo(() => ({
    levels: serverLevels.levelOptions,
    without: serverLevels.withoutLevel,
  }), [serverLevels])



  return (
    <div className="space-y-2.5">
      {/* Header + statistici pe același rând */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-gray-900">Leads</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatChip label="Total" value={stats.total} />
          <StatChip label="🔵 New lead" value={stats.byStatus.LEAD || 0} color="text-blue-600" />
          <StatChip label="📋 Waitlist" value={stats.byStatus.WAITLIST || 0} color="text-teal-700" />
          <StatChip label="💰 A plătit" value={stats.byStatus.PLATIT || 0} color="text-emerald-600" />
          <StatChip label="🟣 Studiază" value={stats.byStatus.STUDIAZA || 0} color="text-purple-600" />
          <StatChip label="🔴 Restante" value={stats.overdue} color="text-red-600" />
          <PermissionGate permission="leads.create">
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Lead nou
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Bară unică: preset-uri + căutare îngustă + filtre */}
      <div
        className={`rounded-lg border px-2 py-2 flex flex-wrap items-center gap-1.5 transition-colors ${
          activeFilterCount > 0
            ? 'bg-indigo-50/60 border-indigo-300'
            : 'bg-white border-gray-200'
        }`}
      >
        <button
          onClick={() => { setStatuses([]); resetPaging() }}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            statuses.length === 0
              ? "bg-indigo-600 text-white"
              : "bg-gray-50 text-gray-700 border border-gray-200 hover:border-indigo-400"
          }`}
        >
          Toate
        </button>
        {LEAD_STATUSES.map((s) => {
          const on = statuses.includes(s.value)
          return (
            <button
              key={s.value}
              onClick={() => toggleStatus(s.value)}
              title={on ? `${s.label} — apasă din nou ca să scoți filtrul` : s.label}
              className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                on
                  ? "bg-indigo-600 text-white ring-2 ring-indigo-200"
                  : "bg-gray-50 text-gray-700 border border-gray-200 hover:border-indigo-400"
              }`}
            >
              {s.emoji} {s.label}
              {on && <span className="ml-1 opacity-80">×</span>}
            </button>
          )
        })}

        <div className="relative w-44">
          <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Caută…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPaging() }}
            className="w-full pl-7 pr-2 py-1.5 text-xs text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <select value={source} onChange={(e) => { setSource(e.target.value); resetPaging() }} className={pick(source)} aria-label="Sursă">
          <option value="">Sursă: toate</option>
          {LEAD_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.emoji} {s.label}</option>)}
        </select>

        <select value={audience} onChange={(e) => { setAudience(e.target.value); resetPaging() }} className={pick(audience)} aria-label="Adult sau copil">
          <option value="">Adult/copil: toți</option>
          <option value="adult">🧑 Adulți</option>
          <option value="copil">🧒 Copii</option>
        </select>

        <select value={ageGroup} onChange={(e) => { setAgeGroup(e.target.value); resetPaging() }} className={pick(ageGroup)} aria-label="Categorie de vârstă">
          <option value="">Vârstă: toate</option>
          {AGE_GROUPS.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>

        <select value={locationType} onChange={(e) => { setLocationType(e.target.value); resetPaging() }} className={pick(locationType)} aria-label="Online sau la sediu">
          <option value="">Unde: oriunde</option>
          {LOCATION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
          ))}
        </select>

        <select value={level} onChange={(e) => { setLevel(e.target.value); resetPaging() }} className={pick(level)} aria-label="Nivel">
          <option value="">Nivel: toate</option>
          {levelOptions.levels.map((l) => (
            <option key={l.value} value={l.value}>{l.value} ({l.count})</option>
          ))}
          {levelOptions.without > 0 && (
            <option value="none">Fără nivel ({levelOptions.without})</option>
          )}
        </select>

        <select value={followUp} onChange={(e) => { setFollowUp(e.target.value); resetPaging() }} className={pick(followUp)} aria-label="Follow-up">
          {FOLLOWUPS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        <select value={period} onChange={(e) => { setPeriod(e.target.value); resetPaging() }} className={pick(period)} aria-label="Perioadă">
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>

        {period === 'interval' && (
          <span className="flex items-center gap-1">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={pick(from)}
              aria-label="De la data"
            />
            <span className="text-gray-400 text-xs">→</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={pick(to)}
              aria-label="Până la data"
            />
          </span>
        )}

        <select value={sort} onChange={(e) => setSort(e.target.value)} className={pick(sort !== 'newest')} aria-label="Sortare">
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <span className="ml-auto flex items-center gap-2 text-[11px] text-gray-500">
          {loading
            ? 'se încarcă…'
            : totalCount === stats.total
              ? `${totalCount} lead-uri`
              : `${totalCount} din ${stats.total}`}
          {activeFilterCount > 0 && (
            <>
              <span className="px-1.5 py-0.5 rounded-full bg-indigo-600 text-white font-semibold">
                {activeFilterCount} {activeFilterCount === 1 ? 'filtru' : 'filtre'}
              </span>
              <button onClick={resetAll} className="inline-flex items-center gap-0.5 text-indigo-600 hover:text-indigo-800 font-medium">
                <XMarkIcon className="h-3 w-3" />
                Resetează
              </button>
            </>
          )}
        </span>
      </div>

      {/* Listă */}
      {loading && displayed.length === 0 ? (
        <div className="space-y-1">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-lg px-3 py-3 animate-pulse flex items-center gap-3">
              <div className="h-4 w-4 rounded bg-gray-100" />
              <div className="h-3 bg-gray-100 rounded w-40" />
              <div className="h-3 bg-gray-100 rounded w-24" />
              <div className="h-3 bg-gray-100 rounded w-16 ml-auto" />
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-white rounded-lg p-6 text-center border border-gray-200">
          <InboxIcon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {activeFilterCount > 0
              ? 'Niciun lead nu corespunde filtrelor'
              : 'Niciun lead încă — adaugă primul cu butonul „Lead nou"'}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {displayed.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              expanded={expandedId === lead.id}
              onToggle={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
              onPatch={patchLead}
              onEdit={() => setEditingLead(lead)}
              onDelete={() => deleteLead(lead)}
              onStatusChange={(newStatus) => changeStatus(lead, newStatus)}
              staff={staff}
              onAssign={(userId) => assignLead(lead, userId)}
            />
          ))}
        </div>
      )}

      {/* Paginare */}
      {!loading && totalCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Pe pagină:</span>
            <select
              value={String(pageSize)}
              onChange={(e) => setPageSize(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
              className={selectClass}
              aria-label="Lead-uri pe pagină"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n === 'all' ? 'Toate' : n}</option>
              ))}
            </select>
            <span>
              {pageSize === 'all'
                ? `toate cele ${totalCount}`
                : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} din ${totalCount}`}
            </span>
          </div>

          {pageSize !== 'all' && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                ‹ Înapoi
              </button>

              {pageNumbers.map((n, i) => (
                n === '…' ? (
                  <span key={`gap-${i}`} className="px-1 text-gray-400 text-xs">…</span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={`min-w-[2rem] px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      n === page
                        ? 'bg-indigo-600 text-white'
                        : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {n}
                  </button>
                )
              ))}

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Înainte ›
              </button>
            </div>
          )}
        </div>
      )}

      {showNewModal && (
        <NewLeadModal
          staff={staff}
          onClose={() => setShowNewModal(false)}
          onSaved={() => { setShowNewModal(false); fetchLeads(search) }}
        />
      )}

      {editingLead && (
        <NewLeadModal
          lead={editingLead}
          staff={staff}
          onClose={() => setEditingLead(null)}
          onSaved={() => { setEditingLead(null); fetchLeads(search) }}
        />
      )}
    </div>
  )
}

function StatChip({ label, value, color = 'text-gray-900' }) {
  return (
    <span className="inline-flex items-baseline gap-1 px-2 py-1 rounded-lg bg-white border border-gray-200">
      <span className="text-[10px] text-gray-500">{label}</span>
      <span className={`text-xs font-bold ${color}`}>{value}</span>
    </span>
  )
}

function NewLeadModal({ onClose, onSaved, lead = null, staff = [] }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-start justify-center p-3 xs:p-6">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        <div
          role="dialog"
          aria-modal="true"
          aria-label={lead ? "Editează lead" : "Lead nou"}
          className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl my-2 xs:my-4"
        >
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 xs:px-6 py-3 flex items-start justify-between gap-3 rounded-t-2xl">
            <div>
              <h2 className="text-base xs:text-lg font-semibold text-gray-900">{lead ? `Editează: ${lead.name}` : "Lead nou"}</h2>
              <p className="text-xs text-gray-500">
                {lead ? "Modifică datele, statusul sau follow-up-ul" : "Instagram, WhatsApp, Messenger, telefon sau recomandare"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Închide"
            >
              <XMarkIcon className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          <div className="p-4 xs:p-6">
            <LeadForm lead={lead} staff={staff} onSaved={onSaved} onCancel={onClose} />
          </div>
        </div>
      </div>
    </div>
  )
}

function LeadRow({ lead, expanded, onToggle, onPatch, onEdit, onDelete, onStatusChange, staff, onAssign }) {
  const status = getStatus(lead.status)
  const source = getSource(lead.source)
  const today = startOfToday()
  const followUp = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt) : null
  const overdue = followUp && followUp < today
  const isToday = followUp && !overdue && followUp < new Date(today.getTime() + 86400000)

  return (
    <div
      className={`bg-white rounded-lg border transition-colors ${
        expanded ? 'border-indigo-400 shadow-sm'
          : overdue ? 'border-red-300 hover:border-indigo-300'
          : status.group === 'nou' ? 'border-blue-300 hover:border-indigo-300'
          : 'border-gray-200 hover:border-indigo-300'
      }`}
    >
      {/* Rând compact */}
      <div className="flex items-stretch">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex-1 text-left px-2 py-1 flex items-center gap-1.5 min-w-0 text-[13px]"
      >
        <span title={status.label} className="leading-none shrink-0">{status.emoji}</span>

        <span className="font-medium text-gray-900 truncate min-w-0 max-w-[42%] sm:max-w-none">
          {lead.name}
        </span>
        <span className={`hidden md:inline shrink-0 px-1.5 rounded text-[10px] font-medium ${source.color}`}>
          {source.emoji} {source.label}
        </span>

        {lead.phone && (
          <span className="hidden lg:flex shrink-0 items-center gap-0.5 text-xs text-gray-500">
            <PhoneIcon className="h-3 w-3" />{lead.phone}
          </span>
        )}
        {lead.interestedIn && (
          <span className="hidden xl:inline shrink-0 px-1 rounded bg-gray-100 text-gray-600 text-[10px] font-medium">
            {lead.interestedIn}
          </span>
        )}
        {getAgeGroup(lead.studentAge, lead.isAdult) && (
          <span className={`hidden xl:inline shrink-0 px-1 rounded text-[10px] font-medium ${getAgeGroup(lead.studentAge, lead.isAdult).color}`}>
            {getAgeGroup(lead.studentAge, lead.isAdult).short}
          </span>
        )}

        <span className="ml-auto flex items-center gap-1.5 shrink-0 text-[11px] text-gray-400 whitespace-nowrap">
          {followUp && (
            <span
              title={`Follow-up: ${followUp.toLocaleDateString('ro-RO')}`}
              className={`flex items-center gap-0.5 ${
                overdue ? 'text-red-600 font-semibold'
                  : isToday ? 'text-orange-600 font-semibold'
                  : 'text-blue-600'
              }`}
            >
              <BellAlertIcon className="h-3 w-3" />
              {followUp.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {lead.notesCount > 0 && <span title={`${lead.notesCount} notițe`}>📝{lead.notesCount}</span>}
          <span className="hidden xs:inline">
            {new Date(lead.createdAt).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })}
          </span>
          <span className="p-0.5 rounded hover:bg-gray-100">
            <ChevronDownIcon className={`h-3.5 w-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </span>
        </span>
      </button>

        {/* Status editabil direct din listă */}
        <PermissionGate permission="leads.edit">
          <select
            value={lead.status}
            onChange={(e) => onStatusChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            title="Schimbă statusul"
            className={`shrink-0 max-w-[8.5rem] px-1 py-0.5 my-1 rounded border text-[10px] font-medium cursor-pointer focus:ring-2 focus:ring-indigo-500 ${status.color}`}
          >
            {statusOptionsFor(lead.status).map((s) => (
              <option key={s.value} value={s.value}>{s.emoji} {s.label}</option>
            ))}
          </select>
        </PermissionGate>

        <div className="flex items-center gap-0.5 pr-1.5 shrink-0">

          <PermissionGate permission="leads.edit">
            <button
              type="button"
              onClick={onEdit}
              title="Editează"
              aria-label="Editează lead-ul"
              className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              <PencilSquareIcon className="h-3.5 w-3.5" />
            </button>
          </PermissionGate>
          <PermissionGate permission="leads.delete">
            <button
              type="button"
              onClick={onDelete}
              title="Șterge"
              aria-label="Șterge lead-ul"
              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </PermissionGate>
        </div>
      </div>

      {expanded && <LeadDetails lead={lead} onPatch={onPatch} staff={staff} onAssign={onAssign} />}
    </div>
  )
}

function LeadDetails({ lead, onPatch, staff = [], onAssign }) {
  const status = getStatus(lead.status)
  const source = getSource(lead.source)
  const chatLink = source.link ? source.link(lead) : null
  const waLink = whatsAppLink(lead.phone)
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replySending, setReplySending] = useState(false)

  // Răspuns direct în conversația din care a venit lead-ul
  const sendReply = async (e) => {
    e?.preventDefault()
    const text = replyText.trim()
    if (!text) return

    setReplySending(true)
    try {
      const res = await fetch('/api/admin/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: lead.metaPersonId, text }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Mesajul nu a putut fi trimis')

      toast.success(json.humanAgent ? 'Trimis ca agent uman' : 'Mesaj trimis')
      setReplyText('')
      setReplyOpen(false)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setReplySending(false)
    }
  }

  const [notes, setNotes] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [followUpDate, setFollowUpDate] = useState(lead.nextFollowUpAt || null)
  const [savingFollowUp, setSavingFollowUp] = useState(false)
  const [converting, setConverting] = useState(false)

  // Trecerea lead-ului în lista de elevi, fără a-i schimba statusul
  const convertToStudent = async () => {
    if (!confirm(`Creezi elevul din lead-ul „${lead.name}"?`)) return
    setConverting(true)
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}/convert`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare la conversie')
      toast.success(data.created ? 'Elev creat din lead' : 'Lead-ul avea deja un elev asociat')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setConverting(false)
    }
  }

  // Notițele se încarcă abia la deschiderea rândului
  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/lead-notes?leadId=${lead.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!cancelled) setNotes(Array.isArray(d) ? d : d?.notes || []) })
      .catch(() => { if (!cancelled) setNotes([]) })
    return () => { cancelled = true }
  }, [lead.id])

  const addNote = async () => {
    if (!noteText.trim()) return
    setSavingNote(true)
    try {
      const res = await fetch('/api/admin/lead-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, content: noteText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare la salvarea notiței')
      setNotes((prev) => [data, ...(prev || [])])
      setNoteText('')
      onPatch(lead.id, { notesCount: (lead.notesCount || 0) + 1 })
      toast.success('Notiță adăugată')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingNote(false)
    }
  }

  const deleteNote = async (noteId) => {
    try {
      const res = await fetch(`/api/admin/lead-notes/${noteId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Eroare la ștergere')
      }
      setNotes((prev) => (prev || []).filter((n) => n.id !== noteId))
      onPatch(lead.id, { notesCount: Math.max((lead.notesCount || 1) - 1, 0) })
    } catch (err) {
      toast.error(err.message)
    }
  }

  // Valoarea vine gata ca ISO cu fus orar, ca ora să nu se mute pe server
  const saveFollowUp = async (value) => {
    setSavingFollowUp(true)
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextFollowUpAt: value || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare la salvare')
      setFollowUpDate(value || null)
      onPatch(lead.id, { nextFollowUpAt: value || null })
      toast.success(value ? 'Follow-up salvat' : 'Follow-up eliminat')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingFollowUp(false)
    }
  }

  return (
    <div className="px-2 pb-2.5 pt-1.5 border-t border-gray-100 space-y-2.5 text-xs">
      {/* Chips vizibile doar pe ecran mic, unde sunt ascunse în rând */}
      <div className="flex flex-wrap gap-1 sm:hidden">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${status.color}`}>
          {status.emoji} {status.label}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${source.color}`}>
          {source.emoji} {source.label}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-1.5">
        {lead.phone && (
          <Detail label="Telefon">
            <a href={`tel:${lead.phone}`} className="text-indigo-600 hover:underline">{lead.phone}</a>
          </Detail>
        )}
        {lead.email && (
          <Detail label="Email">
            <a href={`mailto:${lead.email}`} className="text-indigo-600 hover:underline break-all">{lead.email}</a>
          </Detail>
        )}
        {childrenOf(lead).length > 0 && (
          <Detail label={childrenOf(lead).length > 1 ? `Elevi (${childrenOf(lead).length})` : 'Elev'}>
            <span className="space-y-0.5 block">
              {childrenOf(lead).map((c, i) => (
                <span key={i} className="block">
                  {c.name}
                  {c.isAdult ? ', adult' : c.age ? `, ${c.age} ani` : ''}
                  {c.level ? ` · ${c.level}` : ''}
                </span>
              ))}
            </span>
          </Detail>
        )}
        {lead.interestedIn && <Detail label="Nivel actual">{lead.interestedIn}</Detail>}
        {getAgeGroup(lead.studentAge, lead.isAdult) && (
          <Detail label="Categorie">{getAgeGroup(lead.studentAge, lead.isAdult).label}</Detail>
        )}
        {preferenceLabel(lead) && <Detail label="Preferă">{preferenceLabel(lead)}</Detail>}
        {lead.sourceDetail && <Detail label={source.detailLabel}>{lead.sourceDetail}</Detail>}
        <Detail label="Adăugat">
          {new Date(lead.createdAt).toLocaleDateString('ro-RO', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          })}
          {lead.createdByName ? ` — ${lead.createdByName}` : ''}
        </Detail>
      </div>

      {lead.message && (
        <p className="bg-gray-50 rounded-lg p-2 text-gray-700 whitespace-pre-wrap">
          <ChatBubbleLeftIcon className="h-3.5 w-3.5 inline mr-1 text-gray-400" />
          {lead.message}
        </p>
      )}

      {/* Responsabil */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-gray-400">Responsabil</span>
        <select
          value={lead.assignedToId || ""}
          onChange={(e) => onAssign?.(e.target.value)}
          className="px-2 py-1 text-xs text-gray-900 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">Nimeni</option>
          {staff.map((u) => (
            <option key={u.id} value={u.id}>{u.name || u.email}</option>
          ))}
        </select>
        <span className="text-[10px] text-gray-400">
          primește notificarea de recontactare pe Telegram
        </span>
      </div>

      {/* Follow-up */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-gray-400">Recontactare</span>
        <FollowUpPicker
          value={followUpDate}
          disabled={savingFollowUp}
          onChange={saveFollowUp}
        />
        {[1, 3, 7].map((d) => (
          <button
            key={d}
            type="button"
            disabled={savingFollowUp}
            onClick={() => saveFollowUp(zonedDateInDays(d, 10, 0))}
            className="px-1.5 py-0.5 rounded border border-gray-200 text-[11px] text-gray-600 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50"
          >
            +{d}z
          </button>
        ))}
      </div>

      {/* Notițe */}
      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNote() } }}
            placeholder="Notiță rapidă… (Enter pentru salvare)"
            className="flex-1 px-2 py-1 text-xs text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={addNote}
            disabled={savingNote || !noteText.trim()}
            className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {savingNote ? '…' : 'Adaugă'}
          </button>
        </div>

        {notes === null ? (
          <p className="text-[11px] text-gray-400">Se încarcă notițele…</p>
        ) : notes.length > 0 && (
          <ul className="space-y-1">
            {notes.map((n) => (
              <li key={n.id} className="flex items-start gap-1.5 bg-gray-50 rounded-lg px-2 py-1">
                <span className="flex-1 text-gray-700 whitespace-pre-wrap">{n.content}</span>
                <span className="text-[10px] text-gray-400 whitespace-nowrap">
                  {new Date(n.createdAt).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })}
                  {n.authorName ? ` · ${n.authorName}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => deleteNote(n.id)}
                  className="text-gray-300 hover:text-red-600"
                  aria-label="Șterge notița"
                >
                  <TrashIcon className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Răspuns direct în Messenger / Instagram */}
      {replyOpen && lead.metaPersonId && (
        <form onSubmit={sendReply} className="mb-2 flex items-end gap-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
            rows={2}
            autoFocus
            placeholder={`Răspunde pe ${lead.metaPlatform === 'instagram' ? 'Instagram' : 'Messenger'}… (Enter trimite)`}
            className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
          />
          <button
            type="submit"
            disabled={replySending || !replyText.trim()}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {replySending ? '…' : 'Trimite'}
          </button>
        </form>
      )}

      {/* Acțiuni rapide */}
      <div className="flex flex-wrap gap-1.5">
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-medium hover:bg-indigo-700 transition-colors">
            <PhoneIcon className="h-3 w-3" /> Sună
          </a>
        )}
        {waLink && (
          <a href={waLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-green-600 text-white text-[11px] font-medium hover:bg-green-700 transition-colors">
            🟢 WhatsApp
          </a>
        )}
        {chatLink && !chatLink.startsWith('tel:') && (
          <a href={chatLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-300 text-gray-700 text-[11px] font-medium hover:bg-gray-50 transition-colors">
            {source.emoji} {source.label}
          </a>
        )}
        <button
          type="button"
          onClick={convertToStudent}
          disabled={converting}
          title="Creează elevul din acest lead"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-600 text-white text-[11px] font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
        >
          <AcademicCapIcon className="h-3 w-3" />
          {converting ? "…" : "→ elev"}
        </button>
        {lead.metaPersonId && (
          <button
            type="button"
            onClick={() => setReplyOpen((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700 transition-colors"
          >
            ✍️ {replyOpen ? 'Închide' : 'Răspunde'}
          </button>
        )}
        {lead.metaInboxUrl && (
          <a
            href={lead.metaInboxUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Deschide discuția în inboxul paginii, pe Meta"
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-300 bg-white text-gray-700 text-[11px] font-medium hover:border-blue-400 hover:text-blue-700 transition-colors"
          >
            <PlatformIcon
              platform={lead.metaPlatform}
              className="h-3.5 w-3.5"
              id={`lead-${lead.id}`}
            />
            Deschide în {lead.metaPlatform === 'instagram' ? 'Instagram' : 'Messenger'}
          </a>
        )}
        {lead.metaConversationId && (
          <Link
            href={`/admin/messages?conversation=${encodeURIComponent(lead.metaConversationId)}` +
              `&platform=${lead.metaPlatform || 'messenger'}` +
              `&person=${encodeURIComponent(lead.metaPersonId || '')}` +
              `&name=${encodeURIComponent(lead.name || '')}`}
            title="Deschide conversația din care a venit lead-ul"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-600 text-white text-[11px] font-medium hover:bg-sky-700 transition-colors"
          >
            💬 Vezi conversația
          </Link>
        )}
        <Link href={`/admin/leads/${lead.id}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-300 text-indigo-700 text-[11px] font-medium hover:bg-indigo-50 transition-colors">
          <ArrowTopRightOnSquareIcon className="h-3 w-3" />
          Fișa completă
        </Link>
      </div>
    </div>
  )
}

function Detail({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-gray-800 font-medium break-words">{children}</p>
    </div>
  )
}
