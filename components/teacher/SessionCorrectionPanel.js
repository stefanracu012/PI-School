'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { PencilSquareIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { usePermissions } from '@/hooks/usePermissions'

// Cât timp poate profesorul să corecteze singur, fără administrație (ca pe server)
const ACTION_WINDOW_HOURS = 24

const toDateInput = (iso) => {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Corectarea unei lecții deja înregistrate, direct din pagina sesiunii.
 *
 * Cât timp lecția n-a fost procesată, marcarea prezenței se face mai sus, cu
 * AttendanceManager. Panoul ăsta apare pentru lecțiile deja procesate (sau
 * pentru schimbarea datei/notițelor oricând): schimbarea prezenței mută și
 * pachetul elevului, iar ștergerea întoarce tot ce s-a scăzut pentru ea.
 */
export default function SessionCorrectionPanel({ session, groupId, backHref }) {
  const router = useRouter()
  const { user, hasPermission, isSuperAdmin } = usePermissions()

  const canAct = (permission) => {
    if (isSuperAdmin) return true
    if (!hasPermission(permission)) return false
    if (['SUPERADMIN', 'ADMIN'].includes(user?.role)) return true
    if (hasPermission('teacher.noTimeLimit')) return true
    if (!session.createdAt) return false
    const hours = (Date.now() - new Date(session.createdAt).getTime()) / 3600000
    return hours < ACTION_WINDOW_HOURS
  }

  const canEdit = canAct('teacher.session.edit')
  const canDelete = canAct('teacher.session.delete')

  const [editing, setEditing] = useState(false)
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
  const [deleting, setDeleting] = useState(false)

  if (!canEdit && !canDelete) return null

  const save = async () => {
    setSaving(true)
    try {
      const changed = rows.filter((r) => {
        const original = session.attendances.find((a) => a.id === r.id)
        return original.status !== r.status || (original.notes || '') !== r.notes
      })

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
      setEditing(false)
      router.refresh()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    const warning = session.lessonsDeducted
      ? '\n\nLecția a fost deja procesată: orele scăzute se întorc în pachetele elevilor și absențele se scad.'
      : ''
    if (!confirm(`Ștergi această lecție?${warning}`)) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/sessions/${session.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Eroare la ștergere')
      toast.success('Lecția a fost ștearsă')
      router.push(backHref || `/teacher/groups/${groupId}`)
    } catch (error) {
      toast.error(error.message)
      setDeleting(false)
    }
  }

  if (!editing) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-3 xs:p-4 md:p-6 flex flex-wrap items-center gap-2">
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs xs:text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <PencilSquareIcon className="w-4 h-4" />
            Editează sesiunea
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={remove}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-xs xs:text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <TrashIcon className="w-4 h-4" />
            {deleting ? 'Se șterge…' : 'Șterge sesiunea'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border-2 border-indigo-300 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-indigo-900">Corectează sesiunea</p>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="p-1 rounded hover:bg-indigo-100 text-indigo-700"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
      {session.lessonsDeducted && (
        <p className="px-4 pt-3 text-xs text-indigo-700">
          Orele au fost deja deduse: dacă schimbi prezența, pachetele elevilor și absențele se
          ajustează automat.
        </p>
      )}

      <div className="p-4 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Data și ora</label>
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notițe lecție</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ce s-a lucrat, observații…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
            onClick={() => setEditing(false)}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Anulează
          </button>
        </div>
      </div>
    </div>
  )
}
