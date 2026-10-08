/**
 * Repartizarea pe vârste, pe ciclurile școlare (primar / gimnaziu / liceu).
 *
 * Nu e un câmp de completat: se calculează din vârsta pe care o aveți deja la
 * elev (`age`) sau la lead (`studentAge`). Altfel ar trebui ținute la zi două
 * lucruri care spun același lucru, iar la o zi de naștere ar rămâne greșit.
 *
 * Marginile sunt inclusive: „7–9 ani" înseamnă 7, 8 și 9.
 */

export const AGE_GROUPS = [
  // Sub 7 ani intră tot la primar, ca nimeni să nu rămână pe dinafara filtrelor.
  { value: 'primar', label: 'Primar (6–10 ani)', short: '6–10', min: 3, max: 10, color: 'bg-amber-100 text-amber-800' },
  { value: 'gimnaziu', label: 'Gimnaziu (11–15 ani)', short: '11–15', min: 11, max: 15, color: 'bg-lime-100 text-lime-800' },
  { value: 'liceu', label: 'Liceu (16–18 ani)', short: '16–18', min: 16, max: 18, color: 'bg-cyan-100 text-cyan-800' },
  // Peste 18 ani, fără bifa de adult: tot aici intră.
  { value: 'adulti', label: 'Studenți / adulți', short: '18+', min: 19, max: 120, color: 'bg-gray-200 text-gray-800' },
]

export const AGE_GROUP_VALUES = AGE_GROUPS.map((g) => g.value)

/**
 * Categoria de vârstă a cuiva.
 * @param {number|null} age vârsta în ani
 * @param {boolean} isAdult bifa „adult", când vârsta exactă nu se știe
 */
export function getAgeGroup(age, isAdult = false) {
  if (isAdult) return AGE_GROUPS.find((g) => g.value === 'adulti')

  const n = Number(age)
  if (!Number.isFinite(n) || n <= 0) return null

  return AGE_GROUPS.find((g) => n >= g.min && n <= g.max) || null
}

/** Intervalul pentru o interogare Prisma: { gte, lte }. */
export function ageRange(value) {
  const group = AGE_GROUPS.find((g) => g.value === value)
  return group ? { gte: group.min, lte: group.max } : null
}
