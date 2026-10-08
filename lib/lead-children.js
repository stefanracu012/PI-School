/**
 * Copiii de pe un lead.
 *
 * Un părinte întreabă des pentru doi-trei copii odată, fiecare cu vârsta și
 * nivelul lui. Lead-ul ține lista în `children`, dar păstrează primul copil și
 * în câmpurile vechi (`studentName`, `studentAge`, `isAdult`, `interestedIn`,
 * `lessonType`, `locationType`) — așa tot ce citea dinainte un singur elev
 * (filtre, statistici, mesajele de Telegram, lecțiile de probă) merge mai
 * departe neschimbat, fără să rescriem jumătate de aplicație.
 *
 * Regula, pe scurt: `children` e adevărul, câmpurile vechi sunt oglinda
 * primului copil.
 */

const clean = (v) => (typeof v === 'string' ? v.trim() : v)

/** Un rând de copil, curățat și cu tipurile la locul lor. */
export function normalizeChild(raw = {}) {
  const name = clean(raw.name) || ''
  const isAdult = !!raw.isAdult
  const age = isAdult ? null : (raw.age === '' || raw.age == null ? null : parseInt(raw.age, 10))

  return {
    name,
    age: Number.isFinite(age) ? age : null,
    isAdult,
    level: clean(raw.level) || null,
    lessonType: clean(raw.lessonType) || null,
    locationType: clean(raw.locationType) || null,
  }
}

/** Lista de copii, curățată; rândurile fără nume se aruncă. */
export function normalizeChildren(list) {
  if (!Array.isArray(list)) return []
  return list.map(normalizeChild).filter((c) => c.name.length > 0)
}

/**
 * Copiii unui lead, oricum ar fi el salvat.
 * Lead-urile vechi n-au `children` — le reconstruim din câmpurile singulare.
 */
export function childrenOf(lead) {
  if (!lead) return []
  if (Array.isArray(lead.children) && lead.children.length > 0) return lead.children

  // Lead vechi: „cine învață" completat înseamnă un copil; altfel, contactul
  // însuși e elevul (cazul adulților) și nu avem un copil separat.
  if (lead.studentName?.trim()) {
    return [normalizeChild({
      name: lead.studentName,
      age: lead.studentAge,
      isAdult: lead.isAdult,
      level: lead.interestedIn,
      lessonType: lead.lessonType,
      locationType: lead.locationType,
    })]
  }

  return []
}

/** Câmpurile vechi, calculate din primul copil — oglinda pe care o salvăm. */
export function mirrorOfFirstChild(children) {
  const first = children?.[0]
  if (!first) return null

  return {
    studentName: first.name,
    studentAge: first.age,
    isAdult: first.isAdult,
    interestedIn: first.level,
    lessonType: first.lessonType,
    locationType: first.locationType,
  }
}

/** „Ana (7 ani) · Mihai (10 ani)" — pentru liste și mesaje. */
export function childrenLabel(lead) {
  const kids = childrenOf(lead)
  if (kids.length === 0) return null

  return kids
    .map((c) => (c.isAdult ? `${c.name} (adult)` : c.age ? `${c.name} (${c.age} ani)` : c.name))
    .join(' · ')
}
