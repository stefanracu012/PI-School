/**
 * Cum vrea omul să învețe: singur sau în grupă, online sau la sediu.
 *
 * Aceleași opțiuni la leads și la elevi — la lead e o preferință, la elev
 * devine felul în care chiar învață. Valorile sunt scrise cu litere mici, ca
 * `Group.locationType`, ca să nu avem două convenții în aceeași bază.
 */

export const LESSON_TYPES = [
  { value: 'grup', label: 'În grupă', emoji: '👥', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'individual', label: 'Individual', emoji: '🙋', color: 'bg-purple-100 text-purple-800' },
]

export const LOCATION_TYPES = [
  { value: 'offline', label: 'La sediu', emoji: '🏫', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'online', label: 'Online', emoji: '💻', color: 'bg-sky-100 text-sky-800' },
]

export const LESSON_TYPE_VALUES = LESSON_TYPES.map((t) => t.value)
export const LOCATION_TYPE_VALUES = LOCATION_TYPES.map((t) => t.value)

const find = (list, value) => list.find((x) => x.value === value) || null

export const getLessonType = (value) => find(LESSON_TYPES, value)
export const getLocationType = (value) => find(LOCATION_TYPES, value)

/** Eticheta scurtă, pentru liste: „👥 În grupă · 💻 Online". */
export function preferenceLabel({ lessonType, locationType } = {}) {
  const parts = [getLessonType(lessonType), getLocationType(locationType)]
    .filter(Boolean)
    .map((x) => `${x.emoji} ${x.label}`)
  return parts.length > 0 ? parts.join(' · ') : null
}
