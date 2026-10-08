// Formatări pentru paginile de salarii (rulează în browser — fără bază de date)

const TZ = 'Europe/Chisinau'

export const MONTHS_RO = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
]

export const KIND_LABELS = {
  LESSON: 'Lecție',
  MAKEUP: 'Recuperare',
  BONUS: 'Bonus',
  PAYOUT: 'Salariu achitat',
  ADJUSTMENT: 'Corectare',
}

export const KIND_STYLES = {
  LESSON: 'bg-indigo-50 text-indigo-700',
  MAKEUP: 'bg-sky-50 text-sky-700',
  BONUS: 'bg-amber-50 text-amber-700',
  PAYOUT: 'bg-rose-50 text-rose-700',
  ADJUSTMENT: 'bg-gray-100 text-gray-700',
}

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100

export const fmtLei = (n) =>
  `${round2(Math.abs(n)).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} lei`

export const fmtSigned = (n) => `${round2(n) < 0 ? '−' : '+'}${fmtLei(n)}`

export const fmtBalance = (n) => `${round2(n) < 0 ? '−' : ''}${fmtLei(n)}`

export function fmtDateTime(date) {
  const d = new Date(date)
  const day = d.toLocaleDateString('ro-RO', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ })
  const time = d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
  return `${day}, ${time}`
}

export function currentMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' })
    .formatToParts(new Date())
  const get = (t) => Number(parts.find((p) => p.type === t).value)
  return { year: get('year'), month: get('month') }
}

export function shiftMonth({ year, month }, delta) {
  const idx = year * 12 + (month - 1) + delta
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

export const monthKey = ({ year, month }) => `${year}${String(month).padStart(2, '0')}`
export const monthLabel = ({ year, month }) => `${MONTHS_RO[month - 1]} ${year}`

export function parseMonthKey(key) {
  if (!/^\d{6}$/.test(key || '')) return null
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(4)) }
}

export function salaryRuleLabel(salaryType, rate) {
  if (!salaryType || !(rate > 0)) return 'nesetat'
  return salaryType === 'PER_PRESENCE' ? `${fmtLei(rate)} pe elev prezent` : `${fmtLei(rate)} fix pe lecție`
}

/** Detaliul de sub motiv: prezența și regula, pentru lecții. */
export function entryDetail(entry) {
  if (entry.kind !== 'LESSON' && entry.kind !== 'MAKEUP') return null
  const presence = entry.studentsCount ? `${entry.presentCount ?? 0}/${entry.studentsCount} elevi prezenți` : null
  if (entry.salaryType === 'PER_PRESENCE') return `${presence || '0 prezenți'} × ${fmtLei(entry.rate)}`
  if (entry.salaryType === 'FIXED') return ['Sumă fixă pe lecție', presence].filter(Boolean).join(' · ')
  return presence
}

/** Navigarea între luni, cu „Tot istoricul" la capăt. */
export function MonthPicker({ value, onChange, allowAll = true }) {
  const now = currentMonth()
  const month = value === 'all' ? null : parseMonthKey(value) || now
  const go = (delta) => onChange(monthKey(shiftMonth(month || now, delta)))
  const atNow = month && monthKey(month) >= monthKey(now)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={!month}
          className="px-3 py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40 rounded-l-lg"
          aria-label="Luna anterioară"
        >
          ‹
        </button>
        <span className="px-3 py-2 text-sm font-medium text-gray-900 min-w-[9rem] text-center">
          {month ? monthLabel(month) : 'Tot istoricul'}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={!month || atNow}
          className="px-3 py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40 rounded-r-lg"
          aria-label="Luna următoare"
        >
          ›
        </button>
      </div>
      {month && !atNow && (
        <button type="button" onClick={() => onChange(monthKey(now))} className="text-sm text-indigo-600 hover:underline">
          Luna curentă
        </button>
      )}
      {allowAll && (
        <button
          type="button"
          onClick={() => onChange(month ? 'all' : monthKey(now))}
          className={`px-3 py-2 text-sm rounded-lg border ${
            month ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50' : 'border-indigo-500 bg-indigo-50 text-indigo-700'
          }`}
        >
          Tot istoricul
        </button>
      )}
    </div>
  )
}
