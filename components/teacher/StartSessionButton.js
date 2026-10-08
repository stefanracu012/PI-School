'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  PlusIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CalendarDaysIcon,
  XMarkIcon,
  StarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { canStartSession } from '@/lib/schedule-utils'

const MONTHS_RO = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
const WEEKDAYS_RO = ['Lu','Ma','Mi','Jo','Vi','Sâ','Du']

function MiniCalendar({ selected, onSelect }) {
  // selected = 'YYYY-MM-DD'
  const [year, month] = selected
    ? [parseInt(selected.slice(0,4),10), parseInt(selected.slice(5,7),10)-1]
    : [new Date().getFullYear(), new Date().getMonth()]
  const [viewYear, setViewYear] = useState(year)
  const [viewMonth, setViewMonth] = useState(month)

  const firstDay = new Date(viewYear, viewMonth, 1)
  // JS: 0=Sun..6=Sat → convert to Mon=0..Sun=6
  const offset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  const cells = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const prev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) }
    else setViewMonth(viewMonth - 1)
  }
  const next = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) }
    else setViewMonth(viewMonth + 1)
  }

  return (
    <div className="border border-amber-200 rounded-lg p-3 bg-white">
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prev} className="p-1.5 rounded hover:bg-amber-50 text-gray-600">
          <ChevronLeftIcon className="w-4 h-4" />
        </button>
        <div className="text-sm font-semibold text-gray-800">
          {MONTHS_RO[viewMonth]} {viewYear}
        </div>
        <button type="button" onClick={next} className="p-1.5 rounded hover:bg-amber-50 text-gray-600">
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS_RO.map(w => (
          <div key={w} className="text-[10px] font-medium text-gray-500 text-center py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const key = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
          const isSelected = key === selected
          const isToday = key === todayKey
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(key)}
              className={[
                'h-8 text-xs rounded-md font-medium transition-colors',
                isSelected
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow'
                  : isToday
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    : 'text-gray-700 hover:bg-amber-50',
              ].join(' ')}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function StartSessionButton({ groupId, scheduleDays, scheduleTime, isSuperTeacher = false, hideRegularStart = false }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState(null)

  // Verifică dacă programul permite pornirea lecției ACUM (chiar și pentru super profesor,
  // butonul regular trebuie să respecte ziua programată; super profesorul folosește butonul personalizat).
  const scheduleStatus = canStartSession(scheduleDays, scheduleTime)
  const regularDisabled = !scheduleStatus.canStart

  // Modal state for super-teacher custom date/time
  const [showCustomModal, setShowCustomModal] = useState(false)
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const [customDate, setCustomDate] = useState(todayStr)
  const [customTime, setCustomTime] = useState(nowTime)

  const submitCreate = async (body) => {
    setLoading(true)
    setScheduleError(null)
    try {
      const res = await fetch('/api/teacher/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, ...body })
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Sesiune nouă creată!')
        setShowCustomModal(false)
        router.push(`/teacher/groups/${groupId}/session/${data.id}`)
        router.refresh()
      } else {
        if (data.canStart === false) {
          setScheduleError({
            message: data.error,
            nextSessionFormatted: data.nextSessionFormatted,
          })
          toast.error('Nu poți porni lecția acum')
        } else {
          toast.error(data.error || 'Eroare la crearea sesiunii')
        }
      }
    } catch (e) {
      toast.error('Eroare la crearea sesiunii')
    } finally {
      setLoading(false)
    }
  }

  const handleStartNow = () => submitCreate({})

  const handleCustomSubmit = (e) => {
    e.preventDefault()
    if (!customDate || !customTime) {
      toast.error('Completează data și ora')
      return
    }
    // Build ISO from local date+time (treat as local time)
    const iso = new Date(`${customDate}T${customTime}:00`).toISOString()
    submitCreate({ customDate: iso })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {!hideRegularStart && (
          <button
            onClick={handleStartNow}
            disabled={loading || regularDisabled}
            title={regularDisabled ? (scheduleStatus.reason || 'Nu poți porni lecția astăzi') : undefined}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusIcon className="w-5 h-5" />
            {loading ? 'Se creează...' : 'Începe Sesiune Nouă'}
          </button>
        )}

        {isSuperTeacher && (
          <button
            onClick={() => setShowCustomModal(true)}
            disabled={loading}
            title="Pornește o sesiune cu dată/oră personalizată"
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 shadow-sm"
          >
            <CalendarDaysIcon className="w-5 h-5" />
            <span className="hidden xs:inline">{hideRegularStart ? 'Sesiune nouă (dată/oră)' : 'Sesiune personalizată'}</span>
            <span className="xs:hidden">+ Sesiune</span>
            <StarIcon className="w-4 h-4 text-yellow-200" />
          </button>
        )}
      </div>

      {isSuperTeacher && (
        <p className="text-xs text-amber-700 flex items-center gap-1">
          <StarIcon className="w-3.5 h-3.5" />
          Ești <strong>Super Profesor</strong> — poți porni lecții la orice dată/oră.
        </p>
      )}

      {regularDisabled && !hideRegularStart && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">{scheduleStatus.reason || 'Nu poți porni lecția astăzi.'}</p>
            {scheduleStatus.nextSessionFormatted && (
              <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                <ClockIcon className="w-3.5 h-3.5" />
                Următoarea sesiune: {scheduleStatus.nextSessionFormatted}
              </p>
            )}
            {isSuperTeacher && (
              <p className="text-xs text-amber-700 mt-1">
                Folosește butonul <strong>Sesiune personalizată</strong> dacă chiar trebuie să pornești o sesiune acum.
              </p>
            )}
          </div>
        </div>
      )}

      {scheduleError && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-amber-800 font-medium text-sm">{scheduleError.message}</p>
              {scheduleError.nextSessionFormatted && (
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <ClockIcon className="w-4 h-4" />
                  <span>Următoarea sesiune: {scheduleError.nextSessionFormatted}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom date/time modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50">
              <div className="flex items-center gap-2">
                <CalendarDaysIcon className="w-5 h-5 text-amber-600" />
                <h3 className="font-semibold text-gray-900">Sesiune personalizată</h3>
              </div>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCustomSubmit} className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                Alege data și ora la care a avut loc lecția. Sesiunea va fi creată cu această dată în sistem.
              </p>

              <MiniCalendar selected={customDate} onSelect={setCustomDate} />

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1">
                  <ClockIcon className="w-3.5 h-3.5" />
                  Ora lecției
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={customTime.split(':')[0]}
                    onChange={e => setCustomTime(`${e.target.value}:${customTime.split(':')[1] || '00'}`)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-mono"
                  >
                    {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="text-gray-400 font-bold">:</span>
                  <select
                    value={customTime.split(':')[1] || '00'}
                    onChange={e => setCustomTime(`${customTime.split(':')[0] || '00'}:${e.target.value}`)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-mono"
                  >
                    {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                📅 <strong>Selectat:</strong>{' '}
                {customDate
                  ? new Date(`${customDate}T${customTime}:00`).toLocaleString('ro-RO', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })
                  : '—'}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {loading ? 'Se creează...' : 'Creează sesiunea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
