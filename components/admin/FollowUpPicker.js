'use client'

/**
 * Alegerea datei și orei de recontactare.
 *
 * Minutele merg din 10 în 10, fiindcă atât de des verifică cron-ul — o oră ca
 * 16:08 ar suna tot la 16:10. Valoarea iese ca ISO complet (cu fus orar), ca
 * serverul să nu o interpreteze drept oră UTC și să o mute cu câteva ore.
 */

import { zonedToUtcISO, utcToZonedParts, SCHOOL_TZ } from '@/lib/timezone'

const MINUTES = ['00', '10', '20', '30', '40', '50']
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))

const pad = (n) => String(n).padStart(2, '0')

const parts = (iso) => utcToZonedParts(iso)

export default function FollowUpPicker({ value, onChange, disabled = false, className = '' }) {
  const { date, hour, minute } = parts(value)

  const emit = (nextDate, nextHour, nextMinute) => {
    if (!nextDate) return onChange(null)
    onChange(zonedToUtcISO(nextDate, nextHour, nextMinute))
  }

  const select =
    'px-2 py-1 text-xs text-gray-900 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 font-mono'

  return (
    <div className={className}>
      {/* Data, ora și minutul stau mereu pe un singur rând, chiar și în coloană îngustă */}
      <div className="flex items-center gap-1 flex-nowrap">
        <input
          type="date"
          value={date}
          disabled={disabled}
          onChange={(e) => emit(e.target.value, hour, minute)}
          className="min-w-0 flex-1 px-1.5 py-1 text-xs text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
        />

        <select
          value={hour}
          disabled={disabled || !date}
          onChange={(e) => emit(date, e.target.value, minute)}
          className={`${select} shrink-0`}
          aria-label="Ora"
        >
          {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>

        <span className="text-gray-400 font-bold shrink-0">:</span>

        <select
          value={minute}
          disabled={disabled || !date}
          onChange={(e) => emit(date, hour, e.target.value)}
          className={`${select} shrink-0`}
          aria-label="Minutul"
        >
          {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] text-gray-400" title={`Toate orele sunt în fusul ${SCHOOL_TZ}`}>
          ora Chișinăului
        </span>
        {date && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="text-[10px] text-gray-500 hover:text-red-600 disabled:opacity-50"
          >
            elimină
          </button>
        )}
      </div>
    </div>
  )
}
