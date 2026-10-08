'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  PlayCircleIcon, CalendarDaysIcon, ClockIcon, XMarkIcon, UserIcon,
} from '@heroicons/react/24/outline'

const DAY_LABELS = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du']
const MONTH_NAMES = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

const toDateStr = (d) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Calendar compact: zilele viitoare sunt blocate — o lecție s-a ținut deja. */
function MiniCalendar({ selected, onSelect }) {
  const initial = selected ? new Date(selected) : new Date()
  const [view, setView] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1))

  const year = view.getFullYear()
  const month = view.getMonth()
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const offset = (firstDay.getDay() + 6) % 7 // luni = 0
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  const cells = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ]

  return (
    <div className="border border-gray-200 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setView(new Date(year, month - 1, 1))}
          className="px-2 py-1 rounded hover:bg-gray-100 text-gray-600"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-900 capitalize">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          type="button"
          onClick={() => setView(new Date(year, month + 1, 1))}
          className="px-2 py-1 rounded hover:bg-gray-100 text-gray-600"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} />
          const str = toDateStr(date)
          const isSelected = str === selected
          const isFuture = date > today
          const isToday = str === toDateStr(new Date())

          return (
            <button
              key={str}
              type="button"
              disabled={isFuture}
              onClick={() => onSelect(str)}
              className={`h-8 rounded-lg text-xs font-medium transition-colors ${
                isSelected
                  ? 'bg-indigo-600 text-white'
                  : isFuture
                    ? 'text-gray-300 cursor-not-allowed'
                    : isToday
                      ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                      : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Înregistrarea unei lecții din panoul de admin, la orice dată din trecut —
 * fără restricțiile de orar ale profesorului.
 *
 * Se notează cine a ținut-o de fapt: profesorul (lecția s-a ținut, dar nu a
 * pornit-o) sau administrația. Nota rămâne pe sesiune, ca să se știe mai
 * târziu de ce apare acolo.
 */
export default function AdminStartSessionButton({
  groupId, groupName, teacherName, compact = false,
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => toDateStr(new Date()))
  const [time, setTime] = useState('18:00')
  const [heldBy, setHeldBy] = useState('teacher')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const when = new Date(`${date}T${time}:00`)
    if (isNaN(when.getTime())) return toast.error('Dată invalidă')
    if (when.getTime() > Date.now()) {
      return toast.error('O lecție nu poate fi înregistrată cu dată în viitor')
    }

    const label =
      heldBy === 'teacher'
        ? `Lecție ținută de profesor${teacherName ? ` (${teacherName})` : ''}, înregistrată din admin`
        : 'Lecție ținută de administrație'

    setSaving(true)
    try {
      const res = await fetch('/api/teacher/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          customDate: when.toISOString(),
          notes: note.trim() ? `${label} — ${note.trim()}` : label,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare la pornirea lecției')

      toast.success('Lecție înregistrată — marchează prezențele')
      router.push(`/teacher/groups/${groupId}/session/${data.id}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? 'text-indigo-600 hover:text-indigo-900 text-xs xs:text-sm font-medium'
            : 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors'
        }
      >
        {compact ? 'Pornește lecția' : (
          <>
            <PlayCircleIcon className="h-4 w-4" />
            Pornește lecția
          </>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[92vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-violet-50 sticky top-0">
              <div className="flex items-center gap-2 min-w-0">
                <CalendarDaysIcon className="w-5 h-5 text-indigo-600 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">Înregistrează o lecție</h3>
                  {groupName && <p className="text-xs text-gray-500 truncate">{groupName}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Închide"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submit} className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                Pentru cazurile în care lecția s-a ținut, dar nu a fost pornită din contul
                profesorului. Alege data reală a lecției.
              </p>

              <MiniCalendar selected={date} onSelect={setDate} />

              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1">
                  <ClockIcon className="w-3.5 h-3.5" />
                  Ora lecției
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={time.split(':')[0]}
                    onChange={(e) => setTime(`${e.target.value}:${time.split(':')[1] || '00'}`)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono text-gray-900"
                  >
                    {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="text-gray-400 font-bold">:</span>
                  <select
                    value={time.split(':')[1] || '00'}
                    onChange={(e) => setTime(`${time.split(':')[0] || '00'}:${e.target.value}`)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono text-gray-900"
                  >
                    {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5" />
                  Cine a ținut lecția
                </label>
                <select
                  value={heldBy}
                  onChange={(e) => setHeldBy(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900"
                >
                  <option value="teacher">
                    Profesorul{teacherName ? ` (${teacherName})` : ''} — doar nu a pornit-o
                  </option>
                  <option value="admin">Administrația — am ținut-o noi</option>
                </select>
              </div>

              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Notiță (opțional)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900"
              />

              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-900">
                📅 <strong>Selectat:</strong>{' '}
                {new Date(`${date}T${time}:00`).toLocaleString('ro-RO', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
                <div className="mt-1 text-indigo-700">
                  Urmează ecranul de prezențe; lecțiile se scad din pachete abia acolo.
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Se creează…' : 'Pornește lecția'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
