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


let failed = 0
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log((ok ? 'OK   ' : 'GRESIT') + ' ' + name + ' = ' + JSON.stringify(got) +
    (ok ? '' : '  (asteptat ' + JSON.stringify(want) + ')'))
}

console.log('--- normalizeChildren ---')
eq('randurile fara nume se arunca',
  normalizeChildren([{ name: 'Ana', age: '7' }, { name: '   ' }, { age: 9 }]).length, 1)
eq('varsta devine numar', normalizeChildren([{ name: 'Ana', age: '7' }])[0].age, 7)
eq('adultul nu are varsta',
  normalizeChildren([{ name: 'Ion', age: '40', isAdult: true }])[0].age, null)
eq('numele se curata de spatii', normalizeChildren([{ name: '  Ana  ' }])[0].name, 'Ana')
eq('campurile goale devin null',
  normalizeChildren([{ name: 'Ana', level: '', lessonType: '' }])[0].level, null)
eq('lista lipsa da lista goala', normalizeChildren(undefined), [])

console.log('--- childrenOf ---')
eq('lead nou: ia lista',
  childrenOf({ children: [{ name: 'Ana' }, { name: 'Mihai' }] }).map((c) => c.name),
  ['Ana', 'Mihai'])
eq('lead vechi: reconstruit din campurile singulare',
  childrenOf({ studentName: 'Ana', studentAge: 7, interestedIn: 'A1' }),
  [{ name: 'Ana', age: 7, isAdult: false, level: 'A1', lessonType: null, locationType: null }])
eq('adult care se inscrie singur: niciun copil',
  childrenOf({ name: 'Ion', studentName: null }), [])
eq('lead gol', childrenOf(null), [])

console.log('--- mirrorOfFirstChild ---')
const mirror = mirrorOfFirstChild(normalizeChildren([
  { name: 'Ana', age: '7', level: 'A1', locationType: 'online' },
  { name: 'Mihai', age: '10', level: 'A2' },
]))
eq('oglinda ia primul copil', mirror.studentName, 'Ana')
eq('oglinda ia varsta primului', mirror.studentAge, 7)
eq('oglinda ia nivelul primului', mirror.interestedIn, 'A1')
eq('oglinda ia locatia primului', mirror.locationType, 'online')
eq('fara copii, fara oglinda', mirrorOfFirstChild([]), null)

console.log('--- childrenLabel ---')
eq('eticheta',
  childrenLabel({ children: normalizeChildren([
    { name: 'Ana', age: 7 }, { name: 'Ion', isAdult: true }, { name: 'Dan' },
  ]) }),
  'Ana (7 ani) · Ion (adult) · Dan')

console.log('--- conversia in elevi ---')
// Reproducem regula din lib/lead-conversion.js, ca sa verificam ca din doi
// copii ies doi elevi, cu acelasi parinte.
const rowsFor = (lead) => {
  const kids = childrenOf(lead)
  return kids.length > 0
    ? kids.map((c) => ({ fullName: c.name, age: c.age, parentName: lead.name }))
    : [{ fullName: lead.name, age: lead.studentAge ?? null, parentName: null }]
}

const doiCopii = {
  name: 'Maria Popescu', studentAge: null,
  children: normalizeChildren([{ name: 'Ana', age: 7 }, { name: 'Mihai', age: 10 }]),
}
eq('doi copii -> doi elevi', rowsFor(doiCopii).length, 2)
eq('amandoi au acelasi parinte',
  rowsFor(doiCopii).map((r) => r.parentName), ['Maria Popescu', 'Maria Popescu'])
eq('fiecare cu varsta lui', rowsFor(doiCopii).map((r) => r.age), [7, 10])

const adult = { name: 'Ion Adult', studentName: null, studentAge: 40 }
eq('adultul singur -> un elev, fara parinte', rowsFor(adult), [
  { fullName: 'Ion Adult', age: 40, parentName: null },
])

const leadVechi = { name: 'Parinte', studentName: 'Copil Vechi', studentAge: 9 }
eq('lead vechi -> tot un elev', rowsFor(leadVechi), [
  { fullName: 'Copil Vechi', age: 9, parentName: 'Parinte' },
])

console.log('')
console.log(failed === 0 ? 'TOATE VERIFICARILE AU TRECUT' : failed + ' VERIFICARI AU PICAT')
process.exit(failed === 0 ? 0 : 1)
