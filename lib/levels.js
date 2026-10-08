// Nivelurile folosite la grupe, elevi și leads — clasele școlare, examenele
// și programele speciale PI School. Modifică lista aici — apare automat în
// toate formularele.

export const LEVEL_GROUPS = [
  { band: 'Primar', levels: ['Clasa pregătitoare', 'Clasa 1', 'Clasa 2', 'Clasa 3', 'Clasa 4'] },
  { band: 'Gimnaziu', levels: ['Clasa 5', 'Clasa 6', 'Clasa 7', 'Clasa 8', 'Clasa 9'] },
  { band: 'Liceu', levels: ['Clasa 10', 'Clasa 11', 'Clasa 12'] },
  { band: 'Examene', levels: ['Evaluare Națională', 'Bacalaureat'] },
  { band: 'Programe', levels: ['Liceu', 'Universitate', 'Olimpiadă'] },
]

// Listă plată, fără duplicate — pentru validări.
export const LEVELS = [...new Set(LEVEL_GROUPS.flatMap((g) => g.levels))]

// Eticheta unui optgroup: „Gimnaziu", „Examene".
export const groupLabel = (g) => g.band

/**
 * Nivelul CRM pentru clasa aleasă în formularul public /inscriere
 * ('pregatitoare', '1' … '12'). Altceva → null.
 */
export function levelFromClasa(clasa) {
  const value = String(clasa ?? '').trim()
  if (value === 'pregatitoare') return 'Clasa pregătitoare'
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? `Clasa ${n}` : null
}

export default LEVELS
