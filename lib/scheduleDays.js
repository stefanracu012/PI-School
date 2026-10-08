/**
 * Ordonarea zilelor săptămânii pornind de la ziua curentă (ca la /orar):
 * azi, mâine, apoi restul zilelor în ordine.
 */

const DAY_MAP_JS = {
  0: 'Duminică',
  1: 'Luni',
  2: 'Marți',
  3: 'Miercuri',
  4: 'Joi',
  5: 'Vineri',
  6: 'Sâmbătă',
}

export const ALL_DAYS = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică']

export function jsDayToName(jsDay) {
  return DAY_MAP_JS[jsDay]
}

export function getTodayName() {
  return DAY_MAP_JS[new Date().getDay()]
}

export function getTomorrowName() {
  return DAY_MAP_JS[(new Date().getDay() + 1) % 7]
}

/** Zilele săptămânii, în ordine, începând cu ziua curentă. */
export function getDaysFromToday() {
  const idx = ALL_DAYS.indexOf(getTodayName())
  return [...ALL_DAYS.slice(idx), ...ALL_DAYS.slice(0, idx)]
}

/** Poziția unei zile față de azi: 0 = azi, 6 = ultima zi din ciclul săptămânal. */
export function dayRank(day) {
  const idx = getDaysFromToday().indexOf(day)
  return idx === -1 ? 999 : idx
}

/** Ziua cea mai apropiată de azi dintr-o listă de zile ale unui grup. */
export function nearestDay(scheduleDays) {
  if (!scheduleDays || scheduleDays.length === 0) return null
  return scheduleDays.reduce((best, day) => (dayRank(day) < dayRank(best) ? day : best), scheduleDays[0])
}

/** Extrage ora pentru o zi specifică dintr-un scheduleTime (JSON per-zi sau string simplu). */
export function getTimeForDay(scheduleTime, day) {
  if (!scheduleTime) return null
  try {
    if (scheduleTime.startsWith('{')) {
      const times = JSON.parse(scheduleTime)
      return times[day] || null
    }
    return scheduleTime
  } catch {
    return scheduleTime
  }
}
