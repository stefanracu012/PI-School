'use client'

import { LEVEL_GROUPS, LEVELS, groupLabel } from '@/lib/levels'

/**
 * Select de nivel, grupat pe ciclu (primar / gimnaziu / liceu), examene și programe.
 *
 * Dacă valoarea curentă nu mai există în listă (nivel vechi),
 * o păstrează ca opțiune separată — altfel s-ar pierde tăcut la prima salvare.
 */
export default function LevelSelect({
  value = '',
  onChange,
  name = 'level',
  className = '',
  emptyLabel = 'Fără nivel',
  id,
}) {
  const isLegacy = value && !LEVELS.includes(value)

  return (
    <select id={id} name={name} value={value} onChange={onChange} className={className}>
      <option value="">{emptyLabel}</option>

      {isLegacy && (
        <optgroup label="Nivel curent">
          <option value={value}>{value}</option>
        </optgroup>
      )}

      {LEVEL_GROUPS.map((g) => (
        <optgroup key={g.band} label={groupLabel(g)}>
          {g.levels.map((level) => (
            <option key={`${g.band}-${level}`} value={level}>
              {level}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
