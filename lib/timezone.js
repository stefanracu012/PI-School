/**
 * Orele din CRM sunt mereu ora școlii (Chișinău), nu ora calculatorului.
 *
 * Fără asta, un laptop setat pe alt fus trimite altă oră decât cea aleasă pe
 * ecran, iar notificările ajung decalate. Toate conversiile de mai jos merg
 * prin Intl, deci trecerea la ora de vară e tratată automat.
 */

export const SCHOOL_TZ = 'Europe/Chisinau'

/** Cu câte minute e fusul înaintea UTC la momentul dat (ex. 180 vara). */
export function tzOffsetMinutes(date, timeZone = SCHOOL_TZ) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]))
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour === '24' ? '00' : p.hour), Number(p.minute), Number(p.second)
  )
  return (asUtc - date.getTime()) / 60000
}

/**
 * „2026-08-18" + „17" + „30", citite ca oră de Chișinău → ISO în UTC.
 * Rezultatul e ce trebuie trimis către API.
 */
export function zonedToUtcISO(dateStr, hour, minute, timeZone = SCHOOL_TZ) {
  if (!dateStr) return null
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')

  // Pornim de la varianta „ca și cum ar fi UTC", apoi scădem offsetul real
  const naive = new Date(`${dateStr}T${hh}:${mm}:00Z`)
  if (isNaN(naive.getTime())) return null

  const offset = tzOffsetMinutes(naive, timeZone)
  const utc = new Date(naive.getTime() - offset * 60000)

  // Aproape de schimbarea orei, offsetul poate diferi înainte/după conversie
  const corrected = tzOffsetMinutes(utc, timeZone)
  return corrected === offset
    ? utc.toISOString()
    : new Date(naive.getTime() - corrected * 60000).toISOString()
}

/** ISO din bază → { date: 'YYYY-MM-DD', hour: 'HH', minute: 'MM' }, ora Chișinăului. */
export function utcToZonedParts(iso, timeZone = SCHOOL_TZ) {
  if (!iso) return { date: '', hour: '10', minute: '00' }
  const d = new Date(iso)
  if (isNaN(d.getTime())) return { date: '', hour: '10', minute: '00' }

  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  const p = Object.fromEntries(dtf.formatToParts(d).map((x) => [x.type, x.value]))
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: p.hour === '24' ? '00' : p.hour,
    minute: p.minute,
  }
}

/** Aceeași zi, ora dată, în fusul școlii — pentru scurtături de tip „+3 zile". */
export function zonedDateInDays(days, hour = 10, minute = 0, timeZone = SCHOOL_TZ) {
  const target = new Date(Date.now() + days * 86400000)
  const { date } = utcToZonedParts(target.toISOString(), timeZone)
  return zonedToUtcISO(date, hour, minute, timeZone)
}

/**
 * Interpretează o valoare de dată venită de la client.
 *
 * Clienții vechi (sau un browser cu JS din cache) trimit „2026-08-18T18:00",
 * fără fus orar. Node ar citi asta ca oră UTC și ar muta-o cu 3 ore. Aici,
 * orice valoare fără fus e considerată oră de Chișinău — cum e scrisă pe ecran.
 *
 * @returns {Date|null}
 */
export function parseSchoolDate(value, timeZone = SCHOOL_TZ) {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value

  const raw = String(value).trim()
  if (!raw) return null

  // Are deja fus orar (Z sau ±hh:mm) → e o valoare completă, o luăm ca atare
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const d = new Date(raw)
    return isNaN(d.getTime()) ? null : d
  }

  // Doar data: „2026-08-18" → miezul nopții, ora Chișinăului
  const dateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})$/)
  if (dateOnly) {
    const iso = zonedToUtcISO(dateOnly[1], '00', '00', timeZone)
    return iso ? new Date(iso) : null
  }

  // Dată și oră fără fus: „2026-08-18T18:00" sau „2026-08-18 18:00:00"
  const naive = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/)
  if (naive) {
    const iso = zonedToUtcISO(naive[1], naive[2], naive[3], timeZone)
    return iso ? new Date(iso) : null
  }

  const fallback = new Date(raw)
  return isNaN(fallback.getTime()) ? null : fallback
}
