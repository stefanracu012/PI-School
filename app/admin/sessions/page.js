'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  CalendarDaysIcon,
  UserGroupIcon,
  CheckCircleIcon,
  XCircleIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { usePermissions } from '@/hooks/usePermissions'

const PAGE_SIZES = [20, 50, 100]

const selectClass =
  'px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'

// Input-ul datetime-local vrea ora locală, nu ISO cu Z
const toDateInput = (iso) => {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AdminSessionsPage() {
  const router = useRouter()
  const { hasPermission, isSuperAdmin } = usePermissions()

  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [teachers, setTeachers] = useState([])
  const [groups, setGroups] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [stats, setStats] = useState({ total: 0, totalStudents: 0, present: 0, absent: 0 })
  const [editingId, setEditingId] = useState(null)

  const canEdit = hasPermission('teacher.session.edit') || isSuperAdmin
  const canDelete = hasPermission('teacher.session.delete') || isSuperAdmin

  useEffect(() => {
    if (!hasPermission('sessions.view') && !isSuperAdmin) {
      router.push('/admin')
    }
  }, [hasPermission, isSuperAdmin, router])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (selectedTeacher) params.set('teacherId', selectedTeacher)
      if (selectedGroup) params.set('groupId', selectedGroup)

      const res = await fetch(`/api/admin/sessions?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare la citirea sesiunilor')

      setSessions(data.sessions || [])
      setTeachers(data.teachers || [])
      setGroups(data.groups || [])
      setTotalCount(data.totalCount ?? 0)
      setTotalPages(data.totalPages ?? 1)
      setStats(data.stats || { total: 0, totalStudents: 0, present: 0, absent: 0 })
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, selectedTeacher, selectedGroup])

  useEffect(() => { fetchData() }, [fetchData])

  // Orice filtru nou readuce lista la prima pagină
  useEffect(() => { setPage(1) }, [selectedTeacher, selectedGroup, pageSize])

  // Grupele filtrului se restrâng la profesorul ales
  const groupOptions = selectedTeacher
    ? groups.filter((g) => g.teacherId === selectedTeacher)
    : groups

  const deleteSession = async (lessonSession) => {
    const when = new Date(lessonSession.date).toLocaleString('ro-RO', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    })
    const warning = lessonSession.lessonsDeducted
      ? '\n\nLecția a fost deja procesată: orele scăzute se întorc în pachetele elevilor și absențele se scad.'
      : ''
    if (!confirm(`Ștergi lecția grupei „${lessonSession.group?.name}" din ${when}?${warning}`)) return

    try {
      const res = await fetch(`/api/admin/sessions/${lessonSession.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Eroare la ștergere')
      toast.success('Lecția a fost ștearsă')
      fetchData()
    } catch (error) {
      toast.error(error.message)
    }
  }

  if (loading && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sesiuni de Lecții</h1>
        <p className="text-gray-600 mt-1">
          Vezi, corectează sau șterge lecțiile înregistrate de profesori
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Sesiuni</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Prezențe Totale</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalStudents}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <p className="text-xs text-green-600 uppercase tracking-wide">Prezenți</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.present}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <p className="text-xs text-red-600 uppercase tracking-wide">Absenți</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{stats.absent}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 bg-white rounded-xl p-4 border border-gray-200">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Profesor</label>
          <select
            value={selectedTeacher}
            onChange={(e) => { setSelectedTeacher(e.target.value); setSelectedGroup('') }}
            className={selectClass}
          >
            <option value="">Toți profesorii</option>
            {teachers.map(teacher => (
              <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Grupă</label>
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className={selectClass}
          >
            <option value="">Toate grupele</option>
            {groupOptions.map(group => (
              <option key={group.id} value={group.id}>{group.name} - {group.level}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Pe pagină</label>
          <select
            value={String(pageSize)}
            onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
            className={selectClass}
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={() => { setSelectedTeacher(''); setSelectedGroup('') }}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Resetează filtrele
          </button>
        </div>
        <div className="flex items-end ml-auto text-xs text-gray-500">
          {loading ? 'se încarcă…' : `${totalCount} sesiuni`}
        </div>
      </div>

      {/* Sessions List */}
      <div className="space-y-4">
        {sessions.length === 0 ? (
          <div className="bg-white rounded-xl p-8 border border-gray-200 text-center">
            <CalendarDaysIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">Nu există sesiuni înregistrate</p>
          </div>
        ) : (
          sessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              editing={editingId === session.id}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={() => setEditingId(session.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaved={() => { setEditingId(null); fetchData() }}
              onDelete={() => deleteSession(session)}
            />
          ))
        )}
      </div>

      {/* Paginare */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} din {totalCount}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              ‹ Anterior
            </button>
            {pageNumbers(page, totalPages).map((n, i) =>
              n === '…' ? (
                <span key={`gap-${i}`} className="px-2 text-gray-400">…</span>
              ) : (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    n === page
                      ? 'bg-indigo-600 text-white'
                      : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {n}
                </button>
              )
            )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Următor ›
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// 1 … 4 5 [6] 7 8 … 20
function pageNumbers(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const out = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(totalPages - 1, page + 1)
  if (start > 2) out.push('…')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < totalPages - 1) out.push('…')
  out.push(totalPages)
  return out
}

function SessionCard({ session, editing, canEdit, canDelete, onEdit, onCancelEdit, onSaved, onDelete }) {
  const presentCount = session.attendances?.filter(a => a.status === 'PRESENT').length || 0
  const absentCount = session.attendances?.filter(a => a.status === 'ABSENT').length || 0

  if (editing) {
    return <SessionEditor session={session} onCancel={onCancelEdit} onSaved={onSaved} />
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden border-l-4 border-l-teal-500">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-bold rounded uppercase tracking-wide flex items-center gap-1">
                <CalendarDaysIcon className="w-3.5 h-3.5" />
                Lecție
              </span>
              <h3 className="font-semibold text-gray-900">{session.group?.level}</h3>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Grupa: <span className="font-medium">{session.group?.name}</span> •
              Profesor: <span className="font-medium">{session.group?.teacher?.name}</span>
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              <CalendarDaysIcon className="w-4 h-4 inline mr-1" />
              {new Date(session.date).toLocaleString('ro-RO', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircleIcon className="w-5 h-5" />
              {presentCount} prezenți
            </span>
            <span className="flex items-center gap-1 text-red-600">
              <XCircleIcon className="w-5 h-5" />
              {absentCount} absenți
            </span>

            {canEdit && (
              <button
                onClick={onEdit}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-white"
              >
                <PencilSquareIcon className="w-3.5 h-3.5" />
                Editează
              </button>
            )}
            {canDelete && (
              <button
                onClick={onDelete}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                Șterge
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Session Notes */}
      {session.notes && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
          <p className="text-sm text-amber-800 flex items-start gap-2">
            <DocumentTextIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span><span className="font-medium">Notițe sesiune:</span> {session.notes}</span>
          </p>
        </div>
      )}

      {/* Attendances */}
      <div className="p-4">
        <p className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
          <UserGroupIcon className="w-4 h-4" />
          Prezența elevilor ({session.attendances?.length || 0}):
        </p>

        {session.attendances?.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {session.attendances.map(attendance => (
              <div
                key={attendance.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  attendance.status === 'PRESENT' ? 'bg-green-50' : 'bg-red-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    attendance.status === 'PRESENT' ? 'bg-green-200' : 'bg-red-200'
                  }`}>
                    <span className={`text-sm font-medium ${
                      attendance.status === 'PRESENT' ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {attendance.student?.fullName?.charAt(0) || '?'}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{attendance.student?.fullName}</p>
                    {attendance.notes && (
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <DocumentTextIcon className="w-3 h-3" />
                        {attendance.notes}
                      </p>
                    )}
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  attendance.status === 'PRESENT'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {attendance.status === 'PRESENT' ? 'Prezent' : 'Absent'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">Nu s-a înregistrat prezența</p>
        )}
      </div>

      {/* Deduction info */}
      {session.lessonsDeducted && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100">
          <p className="text-sm text-blue-700">
            ✓ Orele au fost deduse din pachetele elevilor
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Corectarea unei lecții: data, notițele și prezența fiecărui elev.
 * Dacă orele au fost deja deduse, schimbarea prezenței mută și cifrele —
 * de asta apare avertismentul.
 */
function SessionEditor({ session, onCancel, onSaved }) {
  const [date, setDate] = useState(toDateInput(session.date))
  const [notes, setNotes] = useState(session.notes || '')
  const [rows, setRows] = useState(
    (session.attendances || []).map((a) => ({
      id: a.id,
      name: a.student?.fullName || '—',
      status: a.status,
      notes: a.notes || '',
    }))
  )
  const [saving, setSaving] = useState(false)

  const changed = rows.filter((r) => {
    const original = session.attendances.find((a) => a.id === r.id)
    return original.status !== r.status || (original.notes || '') !== r.notes
  })

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: new Date(date).toISOString(),
          notes,
          attendances: changed.map((r) => ({ id: r.id, status: r.status, notes: r.notes })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Eroare la salvare')
      toast.success('Lecția a fost corectată')
      onSaved()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border-2 border-indigo-300 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100">
        <p className="text-sm font-semibold text-indigo-900">
          Corectează lecția — {session.group?.name} ({session.group?.level})
        </p>
        {session.lessonsDeducted && (
          <p className="text-xs text-indigo-700 mt-0.5">
            Orele au fost deja deduse: dacă schimbi prezența, pachetele elevilor și absențele
            se ajustează automat.
          </p>
        )}
      </div>

      <div className="p-4 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Data și ora</label>
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`${selectClass} w-full`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notițe lecție</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ce s-a lucrat, observații…"
              className={`${selectClass} w-full`}
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-700 mb-2">Prezența</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {rows.map((row, i) => (
              <div key={row.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-gray-200">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{row.name}</p>
                  <input
                    type="text"
                    value={row.notes}
                    onChange={(e) => setRows((prev) => prev.map((r, j) => j === i ? { ...r, notes: e.target.value } : r))}
                    placeholder="notiță"
                    className="mt-1 w-full px-2 py-1 text-xs border border-gray-200 rounded text-gray-900"
                  />
                </div>
                <div className="flex gap-1 shrink-0">
                  {['PRESENT', 'ABSENT'].map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setRows((prev) => prev.map((r, j) => j === i ? { ...r, status } : r))}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        row.status === status
                          ? status === 'PRESENT'
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {status === 'PRESENT' ? 'Prezent' : 'Absent'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Se salvează…' : 'Salvează corectura'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Anulează
          </button>
        </div>
      </div>
    </div>
  )
}
