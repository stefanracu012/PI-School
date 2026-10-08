/**
 * Plățile se leagă de o lună, nu de ziua în care a intrat banul.
 *
 * Plățile vechi nu au luna completată, așa că se deduce din data plății —
 * astfel istoricul rămâne coerent fără migrare.
 */

export const MONTH_NAMES = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

/** { year, month } — luna acoperită de plată. */
export function paymentPeriod(payment) {
  if (payment?.forYear && payment?.forMonth) {
    return { year: payment.forYear, month: payment.forMonth }
  }
  const d = new Date(payment?.paymentDate || Date.now())
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export function periodLabel(payment) {
  const { year, month } = paymentPeriod(payment)
  return `${MONTH_NAMES[month - 1]} ${year}`
}

/** Plata acoperă luna dată? */
export function coversMonth(payment, year, month) {
  const p = paymentPeriod(payment)
  return p.year === year && p.month === month
}

/** Suma achitată pentru o lună anume, dintr-o listă de plăți. */
export function paidForMonth(payments = [], year, month) {
  return (payments || [])
    .filter((p) => coversMonth(p, year, month))
    .reduce((sum, p) => sum + (p.amount || 0), 0)
}

/** Opțiuni pentru selectorul de lună: câteva luni în urmă și înainte. */
export function monthOptions(back = 6, forward = 3) {
  const now = new Date()
  const list = []
  for (let i = -back; i <= forward; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    list.push({
      value: `${d.getFullYear()}-${d.getMonth() + 1}`,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
      isCurrent: i === 0,
    })
  }
  return list
}
