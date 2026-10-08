'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { LEAD_STATUSES, getStatus } from '@/lib/leads-config'
import {
  PlusIcon, CheckIcon, XMarkIcon, TrashIcon, AcademicCapIcon, CalendarDaysIcon,
} from '@heroicons/react/24/outline'

const STATUS_LABELS = {
  PROGRAMAT: { label: 'Programată', color: 'bg-blue-100 text-blue-800' },
  PREZENT: { label: 'A venit', color: 'bg-emerald-100 text-emerald-800' },
  ABSENT: { label: 'Nu a venit', color: 'bg-red-100 text-red-800' },
  ANULAT: { label: 'Anulată', color: 'bg-gray-100 text-gray-600' },
}

const toLocalInput = (d) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Lecțiile de probă ale unei grupe.
 *
 * O probă e un eveniment unic, la data și ora indicată — nu se repetă
 * săptămânal în orar. Participantul poate fi un lead, deci nu trebuie creată
 * fișa de elev înainte de a ști dacă rămâne.
 */
export default function TrialLessonsPanel({ groupId }) {
  const [trials, setTrials] = useState([])
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const [candidates, setCandidates] = useState([])
  const [leadId, setLeadId] = useState('')
  const [when, setWhen] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(17, 0, 0, 0)
    return toLocalInput(d)
  })
  const [duration, setDuration] = useState('60')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [candidateStatus, setCandidateStatus] = useState('')

  // Lead-urile grupate pe status, ca alegerea să fie evidentă din listă
  const visibleCandidates = candidateStatus
    ? candidates.filter((c) => c.status === candidateStatus)
    : candidates

  const groupedCandidates = LEAD_STATUSES
    .map((status) => ({ status, items: visibleCandidates.filter((c) => c.status === status.value) }))
    .filter((g) => g.items.length > 0)

  // Statusurile prezente în lista de candidați, pentru filtrele rapide
  const availableStatuses = LEAD_STATUSES
    .map((s) => ({ ...s, count: candidates.filter((c) => c.status === s.value).length }))
    .filter((s) => s.count > 0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/trial-lessons?groupId=${groupId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare la încărcare')
      setTrials(data.trials || [])
      setCanEdit(!!data.canEdit)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => { load() }, [load])

  const openForm = async () => {
    setAdding(true)
    try {
      const res = await fetch('/api/trial-lessons/candidates')
      const data = await res.json()
      if (res.ok) setCandidates(data.leads || [])
    } catch {
      // lista rămâne goală, se poate reîncerca
    }
  }

  const create = async (e) => {
    e.preventDefault()
    if (!leadId) return toast.error('Alege lead-ul care vine la probă')

    setSaving(true)
    try {
      const res = await fetch('/api/trial-lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId, leadId, scheduledAt: new Date(when).toISOString(),
          durationMin: duration, notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare la programare')
      toast.success('Probă programată')
      setAdding(false)
      setLeadId(''); setNotes('')
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (trial, status) => {
    setBusyId(trial.id)
    try {
      const res = await fetch('/api/trial-lessons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: trial.id, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare la salvare')
      setTrials((prev) => prev.map((t) => (t.id === trial.id ? data : t)))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (trial) => {
    if (!confirm('Ștergi această probă?')) return
    setBusyId(trial.id)
    try {
      const res = await fetch(`/api/trial-lessons?id=${trial.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Eroare la ștergere')
      }
      setTrials((prev) => prev.filter((t) => t.id !== trial.id))
      toast.success('Probă ștearsă')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const convert = async (trial) => {
    if (!trial.leadId) return
    if (!confirm(`Creezi elevul din „${trial.participantName}"?`)) return
    setBusyId(trial.id)
    try {
      const res = await fetch(`/api/admin/leads/${trial.leadId}/convert`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare la conversie')
      toast.success(data.created ? 'Elev creat — îl poți adăuga în grupă' : 'Lead-ul avea deja un elev')
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-3 xs:p-4 md:p-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base xs:text-lg md:text-xl font-bold text-gray-900">Lecții de probă</h2>
          <p className="text-xs xs:text-sm text-gray-600">
            Se țin o singură dată, la data și ora stabilite — nu intră în orarul săptămânal
          </p>
        </div>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={openForm}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <PlusIcon className="h-4 w-4" />
            Programează probă
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={create} className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-3 space-y-3">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Cine vine (lead)</label>
              {availableStatuses.length > 1 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  <button
                    type="button"
                    onClick={() => { setCandidateStatus(""); setLeadId("") }}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                      candidateStatus === ""
                        ? "bg-indigo-600 text-white"
                        : "bg-white text-gray-700 border border-gray-200 hover:border-indigo-400"
                    }`}
                  >
                    Toate ({candidates.length})
                  </button>
                  {availableStatuses.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => { setCandidateStatus(s.value); setLeadId("") }}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                        candidateStatus === s.value
                          ? "bg-indigo-600 text-white"
                          : "bg-white text-gray-700 border border-gray-200 hover:border-indigo-400"
                      }`}
                    >
                      {s.emoji} {s.label} ({s.count})
                    </button>
                  ))}
                </div>
              )}
              <select
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Alege din leads…</option>
                {groupedCandidates.map(({ status, items }) => (
                  <optgroup key={status.value} label={`${status.emoji} ${status.label}`}>
                    {items.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}{c.phone ? ` · ${c.phone}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Data și ora</label>
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Durată (min)</label>
              <input
                type="number"
                min="15"
                max="240"
                step="15"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notiță (opțional)"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Se salvează…' : 'Programează'}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Anulează
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
      ) : trials.length === 0 ? (
        <p className="text-sm text-gray-500 border border-gray-100 rounded-xl p-4 text-center">
          Nicio lecție de probă programată pentru această grupă.
        </p>
      ) : (
        <div className="space-y-1.5">
          {trials.map((t) => {
            const cfg = STATUS_LABELS[t.status] || STATUS_LABELS.PROGRAMAT
            return (
              <div
                key={t.id}
                className="border border-gray-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2 text-sm"
              >
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.color}`}>
                  {cfg.label}
                </span>

                <span className="font-medium text-gray-900">{t.participantName}</span>
                {t.isLead && t.leadStatus && (
                  <span
                    title="Statusul lead-ului în pipeline"
                    className={`px-1.5 rounded text-[10px] font-medium ${getStatus(t.leadStatus).color}`}
                  >
                    {getStatus(t.leadStatus).emoji} {getStatus(t.leadStatus).label}
                  </span>
                )}
                {t.participantPhone && (
                  <a href={`tel:${t.participantPhone}`} className="text-xs text-indigo-600 hover:underline">
                    {t.participantPhone}
                  </a>
                )}

                <span className="flex items-center gap-1 text-xs text-gray-600">
                  <CalendarDaysIcon className="h-3.5 w-3.5" />
                  {new Date(t.scheduledAt).toLocaleString('ro-RO', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                  {t.durationMin ? ` · ${t.durationMin} min` : ''}
                </span>

                {t.notes && <span className="text-xs text-gray-500">— {t.notes}</span>}

                {canEdit && (
                  <div className="ml-auto flex items-center gap-1">
                    {t.status === 'PROGRAMAT' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setStatus(t, 'PREZENT')}
                          disabled={busyId === t.id}
                          title="A venit"
                          className="p-1 rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          <CheckIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus(t, 'ABSENT')}
                          disabled={busyId === t.id}
                          title="Nu a venit"
                          className="p-1 rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </>
                    )}

                    {t.isLead && !t.convertedStudentId && t.status === 'PREZENT' && (
                      <button
                        type="button"
                        onClick={() => convert(t)}
                        disabled={busyId === t.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-600 text-white text-[11px] font-medium hover:bg-teal-700 disabled:opacity-50"
                      >
                        <AcademicCapIcon className="h-3 w-3" />
                        → elev
                      </button>
                    )}

                    {t.convertedStudentId && (
                      <Link
                        href={`/admin/students/${t.convertedStudentId}`}
                        className="text-[11px] text-teal-700 hover:underline"
                      >
                        vezi elevul
                      </Link>
                    )}

                    <button
                      type="button"
                      onClick={() => remove(t)}
                      disabled={busyId === t.id}
                      title="Șterge"
                      className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
