'use client'

/**
 * Grafice pentru pagina de reclame — SVG scris de mână, fără biblioteci.
 * Fiecare bară/felie are <title>, deci la hover apare cifra exactă.
 */

export const CHART_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#3b82f6',
]

const niceMax = (max) => {
  if (max <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(max)))
  const scaled = max / pow
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return step * pow
}

const fmt = (v) =>
  Math.abs(v) >= 1000
    ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`
    : Math.round(v * 100) / 100

/**
 * Bare verticale cu gradient — pentru cheltuieli lună de lună.
 * `series` = [{ key, label, color }], `rows` = [{ label, [key]: number }]
 */
export function BarChart({ rows, series, height = 220, formatValue = fmt }) {
  if (!rows || rows.length === 0) {
    return <Empty>Nu sunt date pentru grafic.</Empty>
  }

  const max = niceMax(Math.max(...rows.flatMap((r) => series.map((s) => r[s.key] || 0))))
  const barGroupWidth = 100 / rows.length
  const barWidth = (barGroupWidth * 0.7) / series.length

  return (
    <div>
      <div className="flex" style={{ height }}>
        {/* Axa cu valori */}
        <div className="flex flex-col justify-between pr-2 text-[10px] text-gray-400 shrink-0">
          {[1, 0.75, 0.5, 0.25, 0].map((f) => (
            <span key={f}>{formatValue(max * f)}</span>
          ))}
        </div>

        <div className="relative flex-1 border-l border-b border-gray-200">
          {/* Linii de ghidaj */}
          {[0.25, 0.5, 0.75].map((f) => (
            <div
              key={f}
              className="absolute left-0 right-0 border-t border-dashed border-gray-100"
              style={{ bottom: `${f * 100}%` }}
            />
          ))}

          <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="1" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0.55" />
                </linearGradient>
              ))}
            </defs>

            {rows.map((row, i) =>
              series.map((s, j) => {
                const value = row[s.key] || 0
                const h = max > 0 ? (value / max) * 100 : 0
                const x = i * barGroupWidth + barGroupWidth * 0.15 + j * barWidth
                return (
                  <rect
                    key={`${s.key}-${i}`}
                    x={x}
                    y={100 - h}
                    width={barWidth * 0.88}
                    height={h}
                    fill={`url(#grad-${s.key})`}
                    rx="0.6"
                  >
                    <title>{`${row.label} — ${s.label}: ${formatValue(value)}`}</title>
                  </rect>
                )
              })
            )}
          </svg>
        </div>
      </div>

      {/* Etichetele de pe axa orizontală */}
      <div className="flex pl-8 mt-1">
        {rows.map((r) => (
          <span
            key={r.label}
            className="text-[10px] text-gray-500 text-center truncate"
            style={{ width: `${barGroupWidth}%` }}
            title={r.label}
          >
            {r.short || r.label}
          </span>
        ))}
      </div>

      <Legend series={series} />
    </div>
  )
}

/** Linie cu zonă colorată dedesubt — pentru evoluția mesajelor/lead-urilor. */
export function AreaChart({ rows, series, height = 200, formatValue = fmt }) {
  if (!rows || rows.length < 2) {
    return <Empty>Prea puține luni pentru un grafic de evoluție.</Empty>
  }

  const max = niceMax(Math.max(...rows.flatMap((r) => series.map((s) => r[s.key] || 0))))
  const stepX = 100 / (rows.length - 1)

  const pointsFor = (key) =>
    rows.map((r, i) => [i * stepX, 100 - (max > 0 ? ((r[key] || 0) / max) * 100 : 0)])

  return (
    <div>
      <div className="flex" style={{ height }}>
        <div className="flex flex-col justify-between pr-2 text-[10px] text-gray-400 shrink-0">
          {[1, 0.5, 0].map((f) => (
            <span key={f}>{formatValue(max * f)}</span>
          ))}
        </div>

        <div className="relative flex-1 border-l border-b border-gray-200">
          {[0.5].map((f) => (
            <div
              key={f}
              className="absolute left-0 right-0 border-t border-dashed border-gray-100"
              style={{ bottom: `${f * 100}%` }}
            />
          ))}

          <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`area-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.45" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
                </linearGradient>
              ))}
            </defs>

            {series.map((s) => {
              const pts = pointsFor(s.key)
              const line = pts.map(([x, y]) => `${x},${y}`).join(' ')
              const area = `0,100 ${line} 100,100`
              return (
                <g key={s.key}>
                  <polygon points={area} fill={`url(#area-${s.key})`} />
                  <polyline
                    points={line}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="1.2"
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                  />
                </g>
              )
            })}
          </svg>

          {/* Puncte cu tooltip, pe un strat separat ca să nu se deformeze */}
          <div className="absolute inset-0">
            {rows.map((r, i) => (
              <div
                key={r.label}
                className="absolute top-0 bottom-0 group"
                style={{ left: `${i * stepX}%`, width: `${stepX}%`, transform: 'translateX(-50%)' }}
                title={series.map((s) => `${s.label}: ${formatValue(r[s.key] || 0)}`).join(' · ') + ` (${r.label})`}
              >
                <div className="h-full w-px bg-gray-200 opacity-0 group-hover:opacity-100 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex pl-8 mt-1">
        {rows.map((r, i) => (
          <span
            key={r.label}
            className="text-[10px] text-gray-500 text-center"
            style={{ width: `${100 / rows.length}%` }}
          >
            {i % Math.ceil(rows.length / 8) === 0 ? (r.short || r.label) : ''}
          </span>
        ))}
      </div>

      <Legend series={series} />
    </div>
  )
}

/**
 * Procente întregi care chiar adună 100.
 *
 * Rotunjite fiecare pe cont propriu, 65.4 + 28.3 + 5.1 + 1.2 dau 99 — și
 * omul care le adună crede că lipsește ceva. Metoda resturilor mari împarte
 * unitățile rămase către feliile cu cea mai mare parte zecimală.
 */
function wholePercents(values, total) {
  if (total <= 0) return values.map(() => 0)

  const exact = values.map((v) => ((v || 0) / total) * 100)
  const floors = exact.map(Math.floor)
  let rest = 100 - floors.reduce((a, b) => a + b, 0)

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)

  const out = [...floors]
  for (const { i } of order) {
    if (rest <= 0) break
    out[i]++
    rest--
  }
  return out
}

/** Inel — cum se împarte bugetul pe conturi sau campanii. */
export function DonutChart({ slices, size = 180, formatValue = fmt, centerLabel, centerValue }) {
  const total = slices.reduce((s, x) => s + (x.value || 0), 0)
  if (total <= 0) return <Empty>Nimic de împărțit încă.</Empty>

  // Feliile goale nu desenează nimic, dar umplu legenda cu rânduri de „0%"
  const shown = slices.filter((s) => (s.value || 0) > 0)
  const percents = wholePercents(shown.map((s) => s.value), total)
  const hidden = slices.length - shown.length

  const radius = 42
  const circumference = 2 * Math.PI * radius
  // O pauză mică între felii, ca să se vadă unde se termină una și începe alta
  const gap = shown.length > 1 ? 1.2 : 0
  let offset = 0

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {shown.map((s, i) => {
            const dash = ((s.value || 0) / total) * circumference
            const visible = Math.max(dash - gap, 0.4)
            const el = (
              <circle
                key={s.label}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={s.color || CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth="14"
                strokeDasharray={`${visible} ${circumference - visible}`}
                strokeDashoffset={-offset}
              >
                <title>{`${s.label}: ${formatValue(s.value)} (${percents[i]}%)`}</title>
              </circle>
            )
            offset += dash
            return el
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">{centerLabel}</span>
          <span className="text-base font-bold text-gray-900">{centerValue ?? formatValue(total)}</span>
        </div>
      </div>

      {/* Cifrele stau scrise, nu ascunse sub cursor */}
      <ul className="space-y-1 text-xs min-w-[11rem] flex-1">
        {shown.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
              style={{ background: s.color || CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="text-gray-700 truncate flex-1" title={s.label}>{s.label}</span>
            <span className="text-gray-500 whitespace-nowrap tabular-nums">{formatValue(s.value)}</span>
            <span className="text-gray-900 font-semibold whitespace-nowrap tabular-nums w-9 text-right">
              {percents[i]}%
            </span>
          </li>
        ))}
        {hidden > 0 && (
          <li className="text-[10px] text-gray-400 pl-4.5">
            încă {hidden} {hidden === 1 ? 'sursă fără nimic' : 'surse fără nimic'}
          </li>
        )}
      </ul>
    </div>
  )
}

/** Bare orizontale — clasamentul campaniilor. */
export function RankBars({ rows, formatValue = fmt }) {
  if (!rows || rows.length === 0) return <Empty>Nicio campanie cu cheltuieli.</Empty>
  const max = Math.max(...rows.map((r) => r.value || 0)) || 1

  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="flex items-center justify-between gap-2 text-xs mb-0.5">
            <span className="text-gray-700 truncate" title={r.label}>{r.label}</span>
            <span className="font-semibold text-gray-900 whitespace-nowrap">{formatValue(r.value)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${((r.value || 0) / max) * 100}%`,
                background: `linear-gradient(90deg, ${r.color || CHART_COLORS[i % CHART_COLORS.length]}, ${r.color || CHART_COLORS[i % CHART_COLORS.length]}99)`,
              }}
            />
          </div>
          {r.hint && <p className="text-[10px] text-gray-500 mt-0.5">{r.hint}</p>}
        </li>
      ))}
    </ul>
  )
}

/** Pâlnia: afișări → clicuri → mesaje → lead-uri. */
export function Funnel({ steps, formatValue = fmt }) {
  const max = Math.max(...steps.map((s) => s.value || 0)) || 1

  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const pct = ((s.value || 0) / max) * 100
        const prev = i > 0 ? steps[i - 1].value || 0 : null
        const conversion = prev && prev > 0 ? ((s.value || 0) / prev) * 100 : null
        return (
          <div key={s.label}>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-gray-700">{s.label}</span>
              <span className="font-semibold text-gray-900">
                {formatValue(s.value)}
                {conversion != null && (
                  <span className="ml-1.5 font-normal text-gray-400">{conversion.toFixed(1)}%</span>
                )}
              </span>
            </div>
            <div className="h-6 rounded-lg bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-lg flex items-center justify-end pr-2 text-[10px] font-medium text-white transition-all"
                style={{
                  width: `${Math.max(pct, 3)}%`,
                  background: `linear-gradient(90deg, ${s.color}, ${s.color}bb)`,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Legend({ series }) {
  if (series.length < 2) return null
  return (
    <div className="flex flex-wrap gap-3 mt-2">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}

function Empty({ children }) {
  return (
    <p className="text-sm text-gray-500 text-center py-8 border border-dashed border-gray-200 rounded-lg">
      {children}
    </p>
  )
}
