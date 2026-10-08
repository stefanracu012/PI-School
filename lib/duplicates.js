/**
 * Potrivirea „seamănă cu cineva care există deja", comună pentru elevi și leads.
 *
 * Numele se compară normalizat: fără diacritice, fără majuscule și fără
 * ordinea cuvintelor — „Stefan Racu" găsește „Racu Ștefan".
 *
 * Telefonul se compară pe ultimele 8 cifre (numărul național). Prefixul 373
 * îl au toți, deci nu spune nimic; iar un telefon lipsă sau scris pe jumătate
 * nu trebuie să se potrivească cu nimeni — altfel apare toată lista.
 */

export const normalizeName = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const nameWords = (s) => normalizeName(s).split(' ').filter((w) => w.length >= 3)

// Același nume în orice ordine: „Stefan Racu" e același om cu „Racu Ștefan"
export const sameName = (a, b) => {
  const x = normalizeName(a).split(' ').filter(Boolean).sort().join(' ')
  const y = normalizeName(b).split(' ').filter(Boolean).sort().join(' ')
  return x.length > 0 && x === y
}

const PHONE_TAIL = 8

/** Ultimele 8 cifre, sau null dacă numărul e prea scurt ca să însemne ceva. */
export const phoneKey = (s) => {
  const d = String(s || '').replace(/\D/g, '')
  return d.length >= PHONE_TAIL ? d.slice(-PHONE_TAIL) : null
}

/**
 * Cât de mult seamănă o înregistrare cu ce se introduce acum.
 * @returns {{ score: number, reason: string } | null}
 *   3 = același nume, 2 = același telefon sau nume foarte asemănător,
 *   1 = un cuvânt comun; null = nu seamănă.
 */
export function matchScore({ name, phone }, { names = [], phones = [] }) {
  const typedWords = nameWords(name)
  const typedPhone = phoneKey(phone)

  const exact = typedWords.length > 0 && names.some((n) => sameName(n, name))

  const samePhone = !!typedPhone && phones.some((p) => phoneKey(p) === typedPhone)

  let common = 0
  for (const n of names) {
    const existing = nameWords(n)
    common = Math.max(common, typedWords.filter((w) => existing.includes(w)).length)
  }

  if (exact) return { score: 3, reason: 'același nume' }
  if (samePhone) return { score: 2, reason: 'același telefon' }
  if (common >= 2) return { score: 2, reason: 'nume foarte asemănător' }
  if (common === 1) return { score: 1, reason: 'nume asemănător' }
  return null
}

/** Nimic de căutat dacă n-avem nici un cuvânt, nici un telefon întreg. */
export const hasSomethingToMatch = ({ name, phone }) =>
  nameWords(name).length > 0 || !!phoneKey(phone)
