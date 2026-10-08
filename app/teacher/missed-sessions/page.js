'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  ExclamationTriangleIcon, CheckCircleIcon, XCircleIcon, CalendarDaysIcon,
} from '@heroicons/react/24/outline'

/**
 * Lecțiile raportate ca neefectuate, pentru grupele profesorului.
 * Adminul nu are cum să știe dacă ora chiar s-a ținut — profesorul confirmă.
 */
export default function TeacherMissedSessionsPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/teacher/missed-sessions${showAll ? '?all=true' : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare la încărcare')
      setItems(data.missedSessions || [])
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [showAll])

  useEffect(() => { load() }, [load])

  const resolve = async (item, held) => {
    if (held && !confirm(`Confirmi că lecția din ${formatDate(item.scheduledDate)} s-a ținut? Se creează sesiunea, cu toți elevii marcați prezenți.`)) return
    if (!held && !confirm('Confirmi că lecția chiar nu s-a ținut?')) return

    setBusyId(item.id)
    try {
      const res = await fetch('/api/teacher/missed-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, held }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare la salvare')

      toast.success(
        held
          ? `Lecție înregistrată${data.students ? ` — ${data.students} elevi marcați prezenți` : ''}`
          : 'Confirmat: lecția nu s-a ținut'
      )
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const pending = items.filter((i) => !i.acknowledged)

  return (
    <div className="space-y-4 xs:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl xs:text-2xl font-bold text-gray-900">Lecții neefectuate</h1>
          <p className="text-sm text-gray-600">
            Ore programate pentru care nu s-a pornit nicio sesiune. Confirmă dacă s-au ținut totuși.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          Arată și cele rezolvate
        </label>
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <CheckCircleIcon className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
          <p className="text-gray-600">
            {showAll ? 'Nicio lecție raportată ca neefectuată.' : 'Nimic de confirmat — toate orele sunt în regulă.'}
          </p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800">
                Ai {pending.length} {pending.length === 1 ? 'oră neconfirmată' : 'ore neconfirmate'}.
                Dacă lecția s-a ținut, apasă „S-a ținut" — se creează sesiunea cu data respectivă.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className={`bg-white rounded-xl border p-3 xs:p-4 ${
                  item.acknowledged ? 'border-gray-200 opacity-70' : 'border-amber-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/teacher/groups/${item.groupId}`}
                        className="font-semibold text-gray-900 hover:text-teal-600"
                      >
                        {item.groupName}
                      </Link>
                      {item.level && (
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[11px] font-medium">
                          {item.level}
                        </span>
                      )}
                      {item.acknowledged && (
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[11px]">
                          rezolvată
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-gray-600 mt-1 flex items-center gap-1">
                      <CalendarDaysIcon className="h-4 w-4 shrink-0" />
                      {formatDate(item.scheduledDate)}
                      {item.scheduledTime ? ` · ${item.scheduledTime}` : ''}
                      {item.studentsCount ? ` · ${item.studentsCount} elevi` : ''}
                    </p>

                    {item.reason && (
                      <p className="text-xs text-gray-500 mt-0.5">{item.reason}</p>
                    )}
                  </div>

                  {!item.acknowledged && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => resolve(item, true)}
                        disabled={busyId === item.id}
                        className="inline-flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        <CheckCircleIcon className="h-4 w-4" />
                        S-a ținut
                      </button>
                      <button
                        type="button"
                        onClick={() => resolve(item, false)}
                        disabled={busyId === item.id}
                        className="inline-flex items-center gap-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        <XCircleIcon className="h-4 w-4" />
                        Nu s-a ținut
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('ro-RO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}
