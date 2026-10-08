'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { usePermissions } from '@/hooks/usePermissions'
import { BarChart, AreaChart, DonutChart, RankBars, Funnel, CHART_COLORS } from '@/components/admin/ads/AdCharts'
import { LEAD_STATUSES, getSource } from '@/lib/leads-config'
import {
  ArrowPathIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ExclamationTriangleIcon,
  TrophyIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline'

const MONTH_SHORT = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec']

const PERIODS = [
  { value: 'month', label: 'Luna aceasta' },
  { value: 'prev-month', label: 'Luna trecută' },
  { value: 'quarter', label: 'Ultimele 3 luni' },
  { value: 'year', label: 'Anul acesta' },
  { value: 'all', label: 'De la început' },
  { value: 'custom', label: 'Interval…' },
]

const CACHE_KEY = 'pischool:statistics:v1'

const int = (v) => Number(v || 0).toLocaleString('ro-RO')
const money = (v) => `${Number(v || 0).toLocaleString('ro-RO')} MDL`
const percent = (v) => (v == null ? '—' : `${v}%`)

const monthLabel = (row) => `${MONTH_SHORT[row.month - 1]} ${String(row.year).slice(2)}`

// Verdele e pentru „mai mult e bine"; la plecări și absențe, invers.
const deltaTone = (value, higherIsBetter = true) => {
  if (value == null || value === 0) return 'text-gray-400'
  const good = higherIsBetter ? value > 0 : value < 0
  return good ? 'text-emerald-600' : 'text-red-600'
}

export default function StatisticsClient() {
  const router = useRouter()
  const { hasPermission, isSuperAdmin } = usePermissions()

  const cached = (() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })()

  const [data, setData] = useState(cached?.data || null)
  const [period, setPeriod] = useState(cached?.period || 'month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(!cached)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  // Câți elevi / câte grupe se arată în listele de absențe
  const [riskShown, setRiskShown] = useState(10)
  const [groupsShown, setGroupsShown] = useState(8)

  useEffect(() => {
    if (!hasPermission('statistics.view') && !isSuperAdmin) router.push('/admin')
  }, [hasPermission, isSuperAdmin, router])

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true)
    try {
      const params = new URLSearchParams({ period })
      if (period === 'custom') {
        if (from) params.set('from', from)
        if (to) params.set('to', to)
      }
      if (refresh) params.set('refresh', '1')

      const res = await fetch(`/api/admin/statistics?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eroare la citirea statisticii')

      setData(json)
      setError(null)
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: json, period })) } catch {}
      if (refresh) toast.success('Cifrele au fost recalculate')
    } catch (err) {
      setError(err.message)
      if (refresh) toast.error(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [period, from, to])

  // Intervalul custom se cere doar când e completat, altfel ar trage toată baza
  useEffect(() => {
    if (period === 'custom' && !from && !to) return
    load(false)
  }, [load, period, from, to])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    )
  }

  const school = data?.school
  const leads = data?.leads
  const owners = data?.owners
  const teachers = data?.teachers
  const absence = data?.absence
  const evolution = data?.evolution || []

  return (
    <div className="space-y-4 xs:space-y-6">
      {/* Antet + perioadă */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-xl xs:text-2xl font-bold text-gray-900">Statistică</h1>
          <p className="text-sm text-gray-600">
            Cifrele școlii pentru <b>{data?.period?.label}</b>, comparate cu perioada dinainte
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500"
          >
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>

          {period === 'custom' && (
            <>
              <input
                type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="px-2 py-2 text-sm border border-gray-300 rounded-lg text-gray-900"
                aria-label="De la data"
              />
              <span className="text-gray-400">→</span>
              <input
                type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="px-2 py-2 text-sm border border-gray-300 rounded-lg text-gray-900"
                aria-label="Până la data"
              />
            </>
          )}

          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Se recalculează…' : 'Actualizează'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Nu s-au putut calcula cifrele</p>
            <p className="text-sm text-red-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {data && (
        <>
          {/* ── Rezumatul ───────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              label="Lead-uri noi"
              value={int(leads.total)}
              delta={leads.totalDelta}
              hint={`${leads.inProgress} încă în lucru`}
            />
            <Kpi
              label="Rata de conversie"
              value={percent(leads.conversionRate)}
              tone="indigo"
              hint={
                leads.prevConversionRate != null
                  ? `înainte ${percent(leads.prevConversionRate)}`
                  : `${leads.converted} câștigate`
              }
            />
            <Kpi label="Elevi activi" value={int(school.studentsActive)} hint={`${school.groupsActive} grupe active`} />
            <Kpi
              label="Elevi noi"
              value={int(school.newStudents)}
              delta={school.newStudentsDelta}
              hint={`${school.enrolled} înscrieri în grupe`}
            />

            <Kpi
              label="Plecări"
              value={int(school.left)}
              delta={school.leftDelta}
              higherIsBetter={false}
              tone={school.left > 0 ? 'red' : 'default'}
              hint={`retenție ${percent(school.retentionRate)}`}
            />
            <Kpi
              label="Rata de prezență"
              value={percent(absence.attendanceRate)}
              tone={absence.attendanceRate != null && absence.attendanceRate < 75 ? 'red' : 'emerald'}
              hint={
                absence.prevAttendanceRate != null
                  ? `înainte ${percent(absence.prevAttendanceRate)}`
                  : `${int(absence.absent)} absențe`
              }
            />
            <Kpi
              label="Lecții ținute"
              value={int(school.lessons)}
              delta={school.lessonsDelta}
              hint={`${int(absence.marked)} prezențe marcate`}
            />
            <Kpi
              label="Încasări"
              value={money(school.revenue)}
              delta={school.revenueDelta}
              tone="emerald"
              hint={
                school.debt > 0
                  ? `${money(school.debt)} rămas de încasat`
                  : school.revenuePerStudent != null
                    ? `${money(school.revenuePerStudent)} / elev`
                    : null
              }
            />
          </div>

          {/* ── Pâlnia lead-urilor ──────────────────────────────────── */}
          <div className="grid lg:grid-cols-[1fr_20rem] gap-4">
            <Card
              title="Unde se pierd lead-urile"
              subtitle={`Din cele ${int(leads.total)} lead-uri intrate în perioadă, câte au ajuns la fiecare etapă`}
            >
              <Funnel
                steps={leads.funnel.map((s, i) => ({
                  label: s.label,
                  value: s.value,
                  color: CHART_COLORS[i % CHART_COLORS.length],
                }))}
                formatValue={int}
              />

              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {leads.funnel.slice(1).map((s) => (
                  <div key={s.key} className="rounded-lg border border-gray-100 px-2.5 py-1.5">
                    <p className="text-[11px] text-gray-500 truncate">{s.label}</p>
                    <p className="text-sm font-bold text-gray-900">{percent(s.ofTotal)}</p>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-gray-500 mt-3">
                „Câștigat" înseamnă lead ajuns pe listă de așteptare, la plată sau la studiu — a spus
                da, chiar dacă încă nu are loc în grupă. Procentele sunt raportate la toate lead-urile
                intrate. Un lead marcat „pierdut" nu-și mai ține minte etapa la care s-a oprit, așa că
                apare doar la intrare — pâlnia arată deci minimul sigur, nu o cifră umflată. Lead-urile
                create automat din pagina Elevi nu intră în calcul.
              </p>
            </Card>

            <div className="space-y-4">
              <Card title="Cât durează">
                <p className="text-3xl font-bold text-gray-900">
                  {leads.avgDaysToClient != null ? `${leads.avgDaysToClient} zile` : '—'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  de la primul contact până devine elev, în medie
                </p>
                {leads.overdueFollowUps > 0 && (
                  <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                    {leads.overdueFollowUps} lead-uri cu recontactarea depășită
                  </p>
                )}
              </Card>

              <Card title="Lead-uri pierdute">
                <p className="text-3xl font-bold text-gray-900">{int(leads.lost)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {percent(leads.total > 0 ? Math.round((leads.lost / leads.total) * 1000) / 10 : null)} din
                  cele intrate în perioadă
                </p>
              </Card>
            </div>
          </div>

          {/* ── Responsabilii de lead-uri ───────────────────────────── */}
          <Card
            title="Cine convertește lead-urile"
            subtitle="Fiecare lead atribuit cuiva; unul ajuns pe listă, la plată sau la studiu îi urcă procentul"
          >
            {owners.ranked.length === 0 && owners.tooFew.length === 0 ? (
              <p className="text-sm text-gray-500">
                Niciun lead atribuit în perioada asta. Pune un responsabil pe lead-uri ca să apară aici.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Responsabil</th>
                        <Th hint="Câte lead-uri i-au fost date în perioadă">Primite</Th>
                        <Th hint="Câte au ajuns pe listă de așteptare, au plătit sau studiază">Câștigate</Th>
                        <Th hint="Câștigate împărțit la primite">Conversie</Th>
                        <Th hint="Nici câștigate, nici pierdute — încă se lucrează la ele">Încă deschise</Th>
                        <Th hint="Marcate „Lead pierdut”">Pierdute</Th>
                        <Th hint="Lead-uri deschise cărora le-a trecut data de recontactare">Recontactări întârziate</Th>
                        <Th hint="De la primul contact până a devenit client">Cât durează</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {owners.ranked.map((o, i) => (
                        <tr key={o.id} className={i === 0 ? 'bg-amber-50/50' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                            {i === 0 && <TrophyIcon className="w-4 h-4 inline mr-1 text-amber-500" />}
                            {o.name}
                            {o.role === 'TEACHER' && (
                              <span className="ml-1 text-[10px] text-gray-400">profesor</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center text-gray-700">{int(o.total)}</td>
                          <td className="px-3 py-2 text-center font-semibold text-emerald-700">{int(o.converted)}</td>
                          <td className="px-3 py-2 text-center">
                            <RateBar value={o.conversionRate} />
                          </td>
                          <td className="px-3 py-2 text-center text-gray-600">{int(o.inProgress)}</td>
                          <td className="px-3 py-2 text-center text-gray-600">
                            <span className="block">{int(o.lost)}</span>
                            <span className="block text-[10px] text-gray-400">
                              {percent(o.lostRate)} din primite
                            </span>
                          </td>
                          <td className={`px-3 py-2 text-center ${o.overdue > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                            {o.overdue > 0 ? int(o.overdue) : '—'}
                          </td>
                          <td className="px-3 py-2 text-center text-gray-600 whitespace-nowrap">
                            {o.avgDaysToClient != null ? `${o.avgDaysToClient} zile` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {owners.tooFew.length > 0 && (
                  <p className="text-[11px] text-gray-500 mt-3">
                    Cu prea puține lead-uri ca să aibă un procent de încredere:{' '}
                    {owners.tooFew.map((o) => `${o.name} (${o.total})`).join(', ')}.
                  </p>
                )}
                <div className="text-[11px] text-gray-500 mt-3 space-y-1">
                  <p><b>Câștigate</b> — lead-ul a spus da: stă pe listă de așteptare, a plătit sau învață deja.</p>
                  <p><b>Încă deschise</b> — nici câștigate, nici pierdute: se mai poate lucra la ele.</p>
                  <p>
                    <b>Recontactări întârziate</b> — lead-uri deschise cărora le-a trecut data de
                    recontactare din fișă. Cifra asta arată disciplina, nu norocul.
                  </p>
                  <p>
                    În clasament intră doar cine are cel puțin {owners.minLeads} lead-uri în perioadă —
                    sub atât, un procent spune mai mult despre noroc decât despre muncă.
                    {owners.unassigned > 0 && (
                      <> <b className="text-amber-700">{owners.unassigned} lead-uri n-au niciun responsabil</b> și nu se numără nimănui.</>
                    )}
                  </p>
                </div>
              </>
            )}
          </Card>

          {/* ── Profesorii ──────────────────────────────────────────── */}
          <Card
            title="Cum stau profesorii"
            subtitle="Scorul cântărește prezența elevilor, cât de mulți rămân și dacă lecțiile se închid la timp"
          >
            {teachers.ranked.length === 0 ? (
              <p className="text-sm text-gray-500">Nicio lecție ținută în perioada asta.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Profesor</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Scor</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Elevi</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Noi</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Plecări</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Lecții</th>
                      <Th hint="Prezenți din totalul marcat, apoi prezenți / absenți în cifre">Prezență</Th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Închise</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Încasări</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {teachers.ranked.map((t, i) => (
                      <tr key={t.id} className={i === 0 ? 'bg-amber-50/50' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                          {i === 0 && <TrophyIcon className="w-4 h-4 inline mr-1 text-amber-500" />}
                          {t.name}
                          <span className="block text-[10px] text-gray-400">{t.groupsActive} grupe</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1 rounded-lg text-xs font-bold ${
                            t.score >= 85 ? 'bg-emerald-100 text-emerald-800'
                              : t.score >= 70 ? 'bg-blue-100 text-blue-800'
                              : t.score >= 55 ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {t.score}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-gray-700">{int(t.studentsActive)}</td>
                        <td className="px-3 py-2 text-center text-emerald-700">
                          {t.studentsNew > 0 ? `+${int(t.studentsNew)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {t.left > 0 ? (
                            <span className="text-red-600 font-semibold">
                              −{int(t.left)}
                              <span className="text-[10px] text-gray-400 ml-0.5">{percent(t.churnRate)}</span>
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-700 whitespace-nowrap">
                          {int(t.lessons)}
                          {t.lessonsDelta != null && t.lessonsDelta !== 0 && (
                            <span className={`text-[10px] ml-1 ${deltaTone(t.lessonsDelta)}`}>
                              {t.lessonsDelta > 0 ? '+' : ''}{t.lessonsDelta}%
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <RateBar value={t.attendanceRate} good={85} ok={70} />
                          <span className="block text-[10px] mt-0.5 whitespace-nowrap">
                            <span className="text-emerald-700 font-medium">{int(t.present)}</span>
                            <span className="text-gray-300"> / </span>
                            <span className="text-red-600 font-medium">{int(t.absent)}</span>
                            <span className="text-gray-400"> abs</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-gray-600">{percent(t.closingRate)}</td>
                        <td className="px-3 py-2 text-center text-gray-700 whitespace-nowrap">{money(t.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {teachers.idle.length > 0 && (
              <p className="text-[11px] text-gray-500 mt-3">
                Fără lecții în perioadă: {teachers.idle.map((t) => `${t.name} (${t.studentsActive} elevi)`).join(', ')}.
              </p>
            )}
            <p className="text-[11px] text-gray-500 mt-2 flex items-start gap-1">
              <InformationCircleIcon className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
              <span>
                Scorul = {Math.round(teachers.weights.attendance * 100)}% prezență +{' '}
                {Math.round(teachers.weights.retention * 100)}% elevi rămași +{' '}
                {Math.round(teachers.weights.closing * 100)}% lecții închise la timp. „Închise" înseamnă
                lecții cu orele deduse — o lecție lăsată neprocesată strică cifrele tuturor.
              </span>
            </p>
          </Card>

          {/* ── Absențele ───────────────────────────────────────────── */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Card
              title="Elevi care lipsesc des"
              subtitle="Cel mai bun semn că cineva e pe cale să plece — de la cel mai mare procent de absențe"
              action={
                <ShowCount
                  total={absence.atRisk.length}
                  value={riskShown}
                  onChange={setRiskShown}
                  label="elevi"
                />
              }
            >
              {absence.atRisk.length === 0 ? (
                <p className="text-sm text-gray-500">Nimeni cu două sau mai multe absențe. 🎉</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {absence.atRisk.slice(0, riskShown).map((s) => (
                    <li key={s.studentId} className="py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                        <p className="text-[11px] text-gray-500 truncate">
                          {s.groups.join(', ')}
                          {s.teachers?.length > 0 && ` · ${s.teachers.join(', ')}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-bold ${
                          s.absenceRate >= 50 ? 'text-red-600' : s.absenceRate >= 30 ? 'text-amber-600' : 'text-gray-700'
                        }`}>
                          {percent(s.absenceRate)}
                        </p>
                        <p className="text-[10px] text-gray-500">{s.absent} din {s.total} lecții</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              title="Grupe cu cele mai multe absențe"
              subtitle="Dacă o grupă întreagă lipsește, problema nu e la elevi"
              action={
                <ShowCount
                  total={absence.worstGroups.length}
                  value={groupsShown}
                  onChange={setGroupsShown}
                  label="grupe"
                />
              }
            >
              {absence.worstGroups.length === 0 ? (
                <p className="text-sm text-gray-500">Prea puține lecții ca să iasă un clasament.</p>
              ) : (
                <RankBars
                  rows={absence.worstGroups.slice(0, groupsShown).map((g) => ({
                    label: `${g.name}${g.level ? ` · ${g.level}` : ''}`,
                    value: g.absenceRate ?? 0,
                    hint: `${g.absent} absențe din ${g.present + g.absent} · ${g.teacher || '—'}`,
                    color: (g.absenceRate ?? 0) >= 40 ? '#ef4444' : (g.absenceRate ?? 0) >= 25 ? '#f59e0b' : '#10b981',
                  }))}
                  formatValue={(v) => `${v}%`}
                />
              )}

              {absence.outOfLessons.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">
                    Elevi cu pachetul pe zero ({absence.outOfLessons.length})
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {absence.outOfLessons.map((s) => `${s.name} (${s.group})`).join(', ')}
                  </p>
                </div>
              )}
            </Card>
          </div>

          {/* ── Evoluția ────────────────────────────────────────────── */}
          <Card title="Ultimele 12 luni" subtitle="Lead-uri intrate și câte s-au transformat în elevi">
            <AreaChart
              rows={evolution.map((m) => ({
                label: monthLabel(m),
                leads: m.leads,
                converted: m.converted,
              }))}
              series={[
                { key: 'leads', label: 'Lead-uri', color: '#6366f1' },
                { key: 'converted', label: 'Deveniți elevi', color: '#10b981' },
              ]}
              formatValue={int}
            />
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Elevi intrați și plecați" subtitle="Bara verde peste cea roșie înseamnă că școala crește">
              <BarChart
                rows={evolution.map((m) => ({
                  label: monthLabel(m),
                  newStudents: m.newStudents,
                  left: m.left,
                }))}
                series={[
                  { key: 'newStudents', label: 'Elevi noi', color: '#10b981' },
                  { key: 'left', label: 'Plecări', color: '#ef4444' },
                ]}
                formatValue={int}
              />
            </Card>

            <Card title="Încasări lunare">
              <BarChart
                rows={evolution.map((m) => ({ label: monthLabel(m), revenue: m.revenue }))}
                series={[{ key: 'revenue', label: 'Încasat (MDL)', color: '#f59e0b' }]}
                formatValue={(v) => int(Math.round(v))}
              />
            </Card>
          </div>

          {/* ── Sursele ─────────────────────────────────────────────── */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="De unde vin lead-urile" subtitle="Volumul — nu spune încă nimic despre calitate">
              <DonutChart
                slices={leads.bySource.slice(0, 8).map((s, i) => ({
                  label: getSource(s.source)?.label || s.source,
                  value: s.total,
                  color: CHART_COLORS[i % CHART_COLORS.length],
                }))}
                centerLabel="lead-uri"
                centerValue={int(leads.total)}
                formatValue={int}
              />
            </Card>

            <Card title="Care surse aduc elevi" subtitle="Aceleași surse, dar după cât la sută devin elevi">
              {leads.bySource.filter((s) => s.total >= 3).length === 0 ? (
                <p className="text-sm text-gray-500">Prea puține lead-uri pe fiecare sursă ca să iasă procente.</p>
              ) : (
                <RankBars
                  rows={leads.bySource
                    .filter((s) => s.total >= 3)
                    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))
                    .map((s) => ({
                      label: getSource(s.source)?.label || s.source,
                      value: s.rate ?? 0,
                      hint: `${s.converted} elevi din ${s.total} lead-uri`,
                      color: (s.rate ?? 0) >= 30 ? '#10b981' : (s.rate ?? 0) >= 15 ? '#f59e0b' : '#ef4444',
                    }))}
                  formatValue={(v) => `${v}%`}
                />
              )}
              <p className="text-[11px] text-gray-500 mt-3">
                Se arată doar sursele cu cel puțin 3 lead-uri. O sursă cu volum mic dar conversie mare
                merită împinsă; una cu volum mare și conversie mică costă bani degeaba.
              </p>
            </Card>
          </div>

          {/* ── Statusurile de acum ─────────────────────────────────── */}
          <Card
            title="Toate lead-urile, pe statusuri"
            subtitle="Poza de acum a bazei, indiferent de perioada aleasă"
          >
            <div className="flex flex-wrap gap-2">
              {LEAD_STATUSES.filter((s) => (leads.byStatus[s.value] || 0) > 0).map((s) => (
                <Link
                  key={s.value}
                  href="/admin/leads"
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium ${s.color} hover:opacity-80`}
                >
                  {s.emoji} {s.label}
                  <span className="ml-1.5 font-bold">{int(leads.byStatus[s.value])}</span>
                </Link>
              ))}
            </div>
          </Card>

          <p className="text-[11px] text-gray-400 text-center">
            Calculat {new Date(data.generatedAt).toLocaleString('ro-RO')}
            {data.cached && ' · din memoria de un minut'}
          </p>
        </>
      )}
    </div>
  )
}

// ── Bucăți mici ─────────────────────────────────────────────────────────

/** Cap de tabel cu explicație la hover — coloanele scurte au nevoie de ea. */
function Th({ children, hint }) {
  return (
    <th
      title={hint}
      className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap"
    >
      {children}
    </th>
  )
}

function Card({ title, subtitle, action, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 xs:p-4">
      {title && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm xs:text-base font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-[11px] xs:text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

/** Câte rânduri se arată dintr-o listă lungă — ultimul pas e „toate". */
function ShowCount({ total, value, onChange, label }) {
  const steps = [10, 25, 50].filter((n) => n < total)

  if (total <= 10) return null

  return (
    <select
      value={String(value)}
      onChange={(e) => onChange(e.target.value === 'all' ? total : parseInt(e.target.value, 10))}
      className="px-2 py-1 text-[11px] border border-gray-300 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500"
      aria-label={`Câte ${label} se arată`}
    >
      {steps.map((n) => <option key={n} value={n}>{n} {label}</option>)}
      <option value="all">Toate ({total})</option>
    </select>
  )
}

function Kpi({ label, value, delta, hint, tone = 'default', higherIsBetter = true }) {
  const tones = {
    default: 'text-gray-900',
    indigo: 'text-indigo-700',
    emerald: 'text-emerald-700',
    red: 'text-red-700',
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <p className="text-[11px] text-gray-500 truncate">{label}</p>
      <p className={`text-lg xs:text-2xl font-bold mt-0.5 ${tones[tone] || tones.default}`}>{value}</p>

      <div className="flex items-center gap-1 mt-1 min-h-[1rem]">
        {delta != null && delta !== 0 && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${deltaTone(delta, higherIsBetter)}`}>
            {delta > 0 ? <ArrowTrendingUpIcon className="h-3 w-3" /> : <ArrowTrendingDownIcon className="h-3 w-3" />}
            {Math.abs(delta)}%
          </span>
        )}
        {hint && <span className="text-[10px] text-gray-400 truncate">{hint}</span>}
      </div>
    </div>
  )
}

/**
 * Procent cu bară — se citește dintr-o privire cine e sus și cine jos.
 * Pragurile diferă după ce măsurăm: 30% conversie e foarte bine, 30% prezență
 * e catastrofă.
 */
function RateBar({ value, good = 40, ok = 20 }) {
  if (value == null) return <span className="text-gray-400">—</span>
  const color = value >= good ? 'bg-emerald-500' : value >= ok ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="inline-flex flex-col items-center gap-0.5 min-w-[3.5rem]">
      <span className="text-xs font-bold text-gray-900">{value}%</span>
      <span className="block w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </span>
    </div>
  )
}
