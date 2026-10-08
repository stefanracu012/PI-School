'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { usePermissions } from '@/hooks/usePermissions'
import { monthOptions, paidForMonth, periodLabel } from '@/lib/payments'
import {
  ChevronLeftIcon, ChevronRightIcon, CheckIcon, XMarkIcon, LockClosedIcon,
} from '@heroicons/react/24/outline'

const MONTH_NAMES = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

/**
 * Lecțiile lunare ale unei grupe.
 *
 * Grupa are un număr de lecții pe lună (implicit 8), achitate indiferent dacă
 * un elev vine sau nu. O lună anume poate avea alt număr, fără să schimbe
 * implicitul. Prezențele sunt informative.
 */
export default function LessonPackagePanel({ groupId, sessionHrefBase = '/teacher/groups' }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [lessonsInput, setLessonsInput] = useState('8')
  const [showHistory, setShowHistory] = useState(false)
  const [payingStudent, setPayingStudent] = useState(null)
  const { hasPermission } = usePermissions()
  const canPay = hasPermission('groups.students.payments.create')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/lesson-packages?groupId=${groupId}&year=${year}&month=${month}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eroare la încărcare')
      setData(json)
      setLessonsInput(String(json.stats.total))
      setEditing(false)
    } catch (err) {
      toast.error(err.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [groupId, year, month])

  useEffect(() => { load() }, [load])

  const shiftMonth = (delta) => {
    const d = new Date(year, month - 1 + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth() + 1)
  }

  const saveLessons = async () => {
    const lessons = parseInt(lessonsInput, 10)
    if (!Number.isFinite(lessons) || lessons < 1 || lessons > 60) {
      return toast.error('Numărul de lecții trebuie să fie între 1 și 60')
    }
    setSaving(true)
    try {
      const res = await fetch('/api/lesson-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, year, month, totalLessons: lessons }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eroare la salvare')
      toast.success(`${MONTH_NAMES[month - 1]}: ${lessons} lecții`)
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const resetToDefault = async () => {
    setSaving(true)
    try {
      const res = await fetch(
        `/api/lesson-packages?groupId=${groupId}&year=${year}&month=${month}`,
        { method: 'DELETE' }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eroare la resetare')
      toast.success('Luna revine la numărul implicit al grupei')
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleAttendance = async (session, studentId, current) => {
    if (session.locked || !data?.canEdit) return
    const next = current === 'PRESENT' ? 'ABSENT' : 'PRESENT'

    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === session.id ? { ...s, attendance: { ...s.attendance, [studentId]: next } } : s
      ),
    }))

    try {
      const res = await fetch('/api/teacher/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, studentId, status: next }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Eroare la salvarea prezenței')
      }
    } catch (err) {
      toast.error(err.message)
      setData((prev) => ({
        ...prev,
        sessions: prev.sessions.map((s) =>
          s.id === session.id ? { ...s, attendance: { ...s.attendance, [studentId]: current } } : s
        ),
      }))
    }
  }

  const stats = data?.stats
  const sessions = data?.sessions || []
  const students = data?.students || []
  const canEdit = data?.canEdit
  const isIndividual = data?.group?.billingType === 'INDIVIDUAL'
  const isOverride = data?.package?.isOverride
  const totalsById = Object.fromEntries((data?.studentTotals || []).map((t) => [t.studentId, t]))

  return (
    <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-3 xs:p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base xs:text-lg md:text-xl font-bold text-gray-900">
              {isIndividual ? 'Lecții per elev' : 'Lecții lunare'}
            </h2>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
              isIndividual ? 'bg-purple-100 text-purple-800' : 'bg-indigo-100 text-indigo-800'
            }`}>
              {isIndividual ? 'plată per lecție' : 'plată lunară'}
            </span>
          </div>
          <p className="text-xs xs:text-sm text-gray-600">
            {isIndividual
              ? 'Fiecare elev are pachetul lui — la fiecare prezență se scade o lecție'
              : `Se achită ${data?.group?.monthlyLessons ?? 8} lecții pe lună, indiferent câți elevi vin`}
          </p>
        </div>

        <div className={`items-center gap-1 ${isIndividual ? 'hidden' : 'flex'}`}>
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            aria-label="Luna anterioară"
          >
            <ChevronLeftIcon className="h-4 w-4 text-gray-600" />
          </button>
          <span className="px-3 py-2 text-sm font-semibold text-gray-900 min-w-[9.5rem] text-center capitalize">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            aria-label="Luna următoare"
          >
            <ChevronRightIcon className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-20 bg-gray-100 rounded-xl" />
          <div className="h-32 bg-gray-100 rounded-xl" />
        </div>
      ) : !data ? (
        <p className="text-sm text-gray-500">Nu s-au putut încărca datele.</p>
      ) : (
        <>
          {/* Pachetul lunar — doar la grupele plătite lunar */}
          {isIndividual ? (
            <div className="border border-gray-200 rounded-xl p-3 xs:p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 xs:gap-3">
                <BigStat
                  label="Lecții ținute"
                  value={data.totalSessions ?? 0}
                  hint="de la începutul grupei"
                  tone="indigo"
                />
                <BigStat
                  label="Elevi"
                  value={students.length}
                  hint="în grupă"
                  tone="neutral"
                />
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-2">
                  Lecții rămase
                  <span className="ml-1.5 text-xs font-normal text-gray-500">
                    pachetul fiecărui elev
                  </span>
                </h3>
                {students.length === 0 ? (
                  <p className="text-sm text-gray-500 border border-gray-100 rounded-xl p-4 text-center">
                    Grupa nu are elevi activi.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 xs:gap-3">
                    {students.map((st) => {
                      const left = st.lessonsRemaining ?? 0
                      const tone = left <= 0
                        ? 'border-red-200 bg-red-50'
                        : left <= 2
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-emerald-200 bg-emerald-50'
                      const numberTone = left <= 0
                        ? 'text-red-600'
                        : left <= 2 ? 'text-amber-600' : 'text-emerald-600'
                      return (
                        <div key={st.studentId} className={`rounded-xl border p-2.5 xs:p-3 ${tone}`}>
                          <p className="text-xs font-medium text-gray-700 truncate" title={st.name}>
                            {st.name}
                            {st.status === 'PAUSED' && (
                              <span className="ml-1 text-[10px] text-amber-600">(pauză)</span>
                            )}
                          </p>
                          <p className={`text-2xl xs:text-3xl font-bold leading-tight ${numberTone}`}>
                            {left}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {left === 1 ? 'lecție rămasă' : 'lecții rămase'}
                          </p>
                          <p className="text-[11px] text-gray-600 mt-1">
                            {(totalsById[st.studentId]?.present ?? 0)} lecții făcute
                          </p>
                          {st.payments?.[0] ? (
                            <p className="text-[11px] text-gray-500">
                              ultima plată:{' '}
                              {st.payments[0].lessons > 0 ? `+${st.payments[0].lessons} lecții · ` : ''}
                              {new Date(st.payments[0].date).toLocaleDateString('ro-RO', {
                                day: '2-digit', month: 'short', year: 'numeric',
                              })}
                            </p>
                          ) : (
                            <p className="text-[11px] text-gray-400">fără plăți</p>
                          )}
                          {canPay && (
                            <button
                              type="button"
                              onClick={() => setPayingStudent(st)}
                              className="mt-1.5 px-2 py-1 rounded-lg border border-gray-200 bg-white text-[11px] font-medium text-gray-700 hover:border-emerald-400 hover:text-emerald-700"
                            >
                              + adaugă lecții
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            {editing ? (
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Lecții în {MONTH_NAMES[month - 1]} {year}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={lessonsInput}
                    onChange={(e) => setLessonsInput(e.target.value)}
                    className="w-32 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={saveLessons}
                    disabled={saving}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Se salvează…' : 'Salvează pentru luna asta'}
                  </button>
                  {isOverride && (
                    <button
                      type="button"
                      onClick={resetToDefault}
                      disabled={saving}
                      className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Revino la {data.group.monthlyLessons}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setLessonsInput(String(stats.total)) }}
                    className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    Anulează
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-900 capitalize">
                      {MONTH_NAMES[month - 1]} {year}
                    </h3>
                    {isOverride && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-medium">
                        lună specială
                      </span>
                    )}
                  </div>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                    >
                      Modifică luna asta
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 xs:gap-3">
                  <BigStat
                    label="De achitat"
                    value={stats.total}
                    hint={`lecții în ${MONTH_NAMES[month - 1]}`}
                    tone="neutral"
                  />
                  <BigStat
                    label={`Efectuate în ${MONTH_NAMES[month - 1]}`}
                    value={stats.held}
                    hint="lecții ținute luna asta"
                    tone="indigo"
                  />
                  <BigStat
                    label="Rămase"
                    value={stats.remaining}
                    hint={stats.remaining === 0 ? 'pachet epuizat' : 'până la finalul lunii'}
                    tone={stats.remaining === 0 ? 'muted' : 'emerald'}
                  />
                  <BigStat
                    label={stats.extra > 0 ? 'Peste plan' : 'Progres'}
                    value={stats.extra > 0 ? `+${stats.extra}` : `${Math.round((stats.held / stats.total) * 100)}%`}
                    hint={stats.extra > 0 ? 'lecții neachitate' : 'din pachetul lunii'}
                    tone={stats.extra > 0 ? 'amber' : 'neutral'}
                  />
                  {/* Cât s-a lucrat cu grupa de la început, nu doar luna asta */}
                  <BigStat
                    label="Total grupă"
                    value={data.totalSessions ?? 0}
                    hint="lecții de la început"
                    tone="neutral"
                  />
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>
                  <b className="text-gray-900">{stats.held}</b> din <b className="text-gray-900">{stats.total}</b> lecții ținute
                </span>
                {stats.remaining > 0 && <span>mai sunt {stats.remaining}</span>}
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    stats.extra > 0 ? 'bg-amber-500' : stats.held >= stats.total ? 'bg-emerald-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${Math.min((stats.held / stats.total) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>

          )}

          {/* Prezențele lunii */}
          <div>
            <h3 className="text-base font-bold text-gray-900 mb-2">
              Prezențe
              <span className="ml-1.5 text-sm font-normal text-gray-500 capitalize">
                {isIndividual ? 'toate lecțiile' : `${MONTH_NAMES[month - 1]} ${year}`}
              </span>
            </h3>

            {sessions.length === 0 ? (
              <p className="text-sm text-gray-500 border border-gray-100 rounded-xl p-4 text-center">
                {isIndividual
                  ? 'Nicio lecție ținută încă. Lecțiile apar aici pe măsură ce profesorul pornește sesiuni din pagina grupei.'
                  : 'Nicio lecție ținută în această lună. Lecțiile apar aici pe măsură ce profesorul pornește sesiuni din pagina grupei.'}
              </p>
            ) : students.length === 0 ? (
              <p className="text-sm text-gray-500 border border-gray-100 rounded-xl p-4 text-center">
                Grupa nu are elevi activi.
              </p>
            ) : (
              <div className="overflow-x-auto border border-gray-100 rounded-xl">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50">
                        Elev
                      </th>
                      {sessions.map((s, i) => (
                        <th key={s.id} className="px-2 py-2 text-center text-xs font-medium text-gray-500 whitespace-nowrap">
                          <Link
                            href={`${sessionHrefBase}/${groupId}/session/${s.id}`}
                            className="block hover:text-indigo-600 hover:underline"
                            title="Deschide sesiunea — editează sau șterge"
                          >
                            <span className="block text-[10px] text-gray-400">{i + 1}</span>
                            {new Date(s.date).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' })}
                          </Link>
                          {s.locked && <LockClosedIcon className="h-3 w-3 inline ml-0.5 text-gray-400" />}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                        {isIndividual ? 'Prezențe' : 'Luna'}
                      </th>
                      {!isIndividual && (
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                          Total grupă
                        </th>
                      )}
                      {isIndividual && (
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                          Lecții rămase
                        </th>
                      )}
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                        {isIndividual ? 'Ultima plată' : 'Plată'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {students.map((st) => {
                      const present = sessions.filter((s) => s.attendance[st.studentId] === 'PRESENT').length
                      const absent = sessions.filter((s) => s.attendance[st.studentId] === 'ABSENT').length
                      const all = totalsById[st.studentId] || { present: 0, absent: 0 }
                      return (
                        <tr key={st.studentId} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white">
                            {st.name}
                            {st.status === 'PAUSED' && (
                              <span className="ml-1 text-[10px] text-amber-600">(pauză)</span>
                            )}
                          </td>
                          {sessions.map((s) => (
                            <td key={s.id} className="px-2 py-1.5 text-center">
                              <AttendanceCell
                                value={s.attendance[st.studentId]}
                                locked={s.locked || !canEdit}
                                onClick={() => toggleAttendance(s, st.studentId, s.attendance[st.studentId])}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <span className="text-emerald-600 font-semibold">{present}</span>
                            <span className="text-gray-300"> / </span>
                            <span className="text-red-600 font-semibold">{absent}</span>
                          </td>
                          {!isIndividual && (
                            <td className="px-3 py-2 text-center whitespace-nowrap text-xs text-gray-500">
                              {all.present} prezent / {all.absent} absent
                            </td>
                          )}
                          {isIndividual && (
                            <td className="px-3 py-2 text-center whitespace-nowrap">
                              <span className={`font-bold ${
                                (st.lessonsRemaining ?? 0) <= 0 ? 'text-red-600'
                                  : (st.lessonsRemaining ?? 0) <= 2 ? 'text-amber-600'
                                  : 'text-emerald-600'
                              }`}>
                                {st.lessonsRemaining ?? 0}
                              </span>
                            </td>
                          )}
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            {isIndividual ? (
                              st.payments?.[0] ? (
                                <span className="text-xs text-gray-700">
                                  {st.payments[0].lessons > 0 && (
                                    <b className="text-emerald-700">+{st.payments[0].lessons} lecții</b>
                                  )}{' '}
                                  {new Date(st.payments[0].date).toLocaleDateString('ro-RO', {
                                    day: '2-digit', month: '2-digit', year: 'numeric',
                                  })}
                                </span>
                              ) : (
                                <span className="text-red-500 text-xs">fără plăți</span>
                              )
                            ) : st.payment ? (
                              <span className="text-emerald-700 font-semibold">
                                {st.payment.amount.toLocaleString("ro-RO")} lei
                                {st.payment.debt > 0 && (
                                  <span className="block text-[10px] font-medium text-red-600">
                                    datorie {st.payment.debt.toLocaleString('ro-RO')} lei
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-red-500 text-xs">neachitat</span>
                            )}
                            {canPay && (
                              <button
                                type="button"
                                onClick={() => setPayingStudent(st)}
                                className="ml-1.5 px-1.5 py-0.5 rounded border border-gray-200 text-[10px] text-gray-600 hover:border-emerald-400 hover:text-emerald-700"
                              >
                                + plată
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td className="px-3 py-2 text-xs font-medium text-gray-500 sticky left-0 bg-gray-50">
                        Prezenți
                      </td>
                      {sessions.map((s) => {
                        const present = students.filter((st) => s.attendance[st.studentId] === 'PRESENT')
                        const absent = students.filter((st) => s.attendance[st.studentId] === 'ABSENT')
                        return (
                          <td
                            key={s.id}
                            className="px-2 py-2 text-center text-xs font-semibold text-gray-700"
                            title={[
                              present.length ? 'Prezenți: ' + present.map((p) => p.name).join(', ') : null,
                              absent.length ? 'Absenți: ' + absent.map((a) => a.name).join(', ') : null,
                            ].filter(Boolean).join(' | ')}
                          >
                            {present.length}
                          </td>
                        )
                      })}
                      <td /><td /><td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {sessions.some((s) => s.locked) && (
              <p className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1">
                <LockClosedIcon className="h-3 w-3" />
                Lecțiile cu lacăt sunt deja închise — prezența nu mai poate fi modificată.
              </p>
            )}
          </div>

          {/* Istoric lunar */}
          {!isIndividual && data.history?.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="text-sm font-semibold text-gray-900">
                  Istoric lunar
                  <span className="ml-1.5 font-normal text-gray-500">
                    {data.history.length} {data.history.length === 1 ? 'lună' : 'luni'} de la începutul grupei
                  </span>
                </span>
                <span className="text-gray-400 text-lg leading-none">{showHistory ? '▴' : '▾'}</span>
              </button>

              {showHistory && (
                <div className="mt-2 overflow-x-auto border border-gray-100 rounded-xl">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Luna</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">De achitat</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Efectuate</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Rămase</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.history.map((h) => (
                        <tr
                          key={`${h.year}-${h.month}`}
                          className={`hover:bg-gray-50 cursor-pointer ${
                            h.year === year && h.month === month ? 'bg-indigo-50/60' : ''
                          }`}
                          onClick={() => { setYear(h.year); setMonth(h.month) }}
                        >
                          <td className="px-3 py-1.5 capitalize text-gray-900">
                            {MONTH_NAMES[h.month - 1]} {h.year}
                            {h.isOverride && (
                              <span className="ml-1 text-[10px] text-amber-600">(specială)</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-center text-gray-700">{h.total}</td>
                          <td className="px-3 py-1.5 text-center font-medium text-indigo-600">{h.held}</td>
                          <td className={`px-3 py-1.5 text-center font-medium ${h.remaining === 0 ? 'text-gray-400' : 'text-emerald-600'}`}>
                            {h.remaining}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {payingStudent && (
        <PaymentModal
          student={payingStudent}
          monthLabel={`${MONTH_NAMES[month - 1]} ${year}`}
          year={year}
          month={month}
          billingType={data?.group?.billingType}
          defaultLessons={stats?.total ?? 8}
          onClose={() => setPayingStudent(null)}
          onSaved={() => { setPayingStudent(null); load() }}
        />
      )}
    </div>
  )
}

const TONES = {
  neutral: 'border-gray-200 bg-white text-gray-900',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  muted: 'border-gray-200 bg-gray-50 text-gray-500',
}

/** Cifra lunii, scrisă mare, cu explicație dedesubt. */
function BigStat({ label, value, hint, tone = 'neutral' }) {
  return (
    <div className={`rounded-xl border p-3 ${TONES[tone] || TONES.neutral}`}>
      <p className="text-[10px] xs:text-xs uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-2xl xs:text-3xl font-bold leading-tight">{value}</p>
      {hint && <p className="text-[10px] xs:text-[11px] opacity-70">{hint}</p>}
    </div>
  )
}

function Stat({ label, value, color = 'text-gray-900' }) {
  return (
    <div>
      <p className="text-[10px] xs:text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl xs:text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

function AttendanceCell({ value, locked, onClick }) {
  const base = 'w-7 h-7 rounded-md inline-flex items-center justify-center transition-colors'

  if (value === 'PRESENT') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={locked}
        title={locked ? 'Prezent (blocat)' : 'Prezent — click pentru absent'}
        className={`${base} bg-emerald-100 text-emerald-700 ${locked ? 'cursor-default' : 'hover:bg-emerald-200'}`}
      >
        <CheckIcon className="h-4 w-4" />
      </button>
    )
  }

  if (value === 'ABSENT') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={locked}
        title={locked ? 'Absent (blocat)' : 'Absent — click pentru prezent'}
        className={`${base} bg-red-100 text-red-700 ${locked ? 'cursor-default' : 'hover:bg-red-200'}`}
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      title={locked ? 'Nemarcat' : 'Nemarcat — click pentru prezent'}
      className={`${base} bg-gray-100 text-gray-400 ${locked ? 'cursor-default' : 'hover:bg-gray-200'}`}
    >
      –
    </button>
  )
}

function PaymentModal({ student, monthLabel, defaultLessons, year, month, billingType, onClose, onSaved }) {
  const [amount, setAmount] = useState('')
  const [debt, setDebt] = useState('')
  const [method, setMethod] = useState('cash')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [period, setPeriod] = useState(`${year}-${month}`)
  const [payMode, setPayMode] = useState(billingType === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'MONTHLY')
  const [lessons, setLessons] = useState('8')
  const periods = monthOptions()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e) => {
    e.preventDefault()
    const value = parseFloat(amount)
    if (!Number.isFinite(value) || value <= 0) return toast.error('Suma trebuie să fie mai mare ca 0')

    setSaving(true)
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupStudentId: student.groupStudentId,
          amount: value,
          debt: debt === '' ? null : parseFloat(debt),
          paymentDate: new Date(date).toISOString(),
          paymentMethod: method,
          ...(payMode === 'INDIVIDUAL'
            ? { lessonsAdded: parseInt(lessons, 10) || 0 }
            : {
                forYear: parseInt(period.split('-')[0], 10),
                forMonth: parseInt(period.split('-')[1], 10),
              }),
          notes: `Plată ${monthLabel}`,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare la salvarea plății')
      toast.success('Plată înregistrată')
      onSaved()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        <form
          onSubmit={submit}
          className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4"
        >
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Plată — {student.name}</h2>
            <p className="text-xs text-gray-500 capitalize">{monthLabel}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Sumă (lei) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Datorie rămasă (MDL)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={debt}
                onChange={(e) => setDebt(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Cât mai are de plată. Lasă gol dacă a achitat tot.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Metodă</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="transfer">Transfer</option>
              </select>
            </div>
            <div className="col-span-2 grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg">
              <button
                type="button"
                onClick={() => setPayMode('MONTHLY')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  payMode === 'MONTHLY' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                Lunar
              </button>
              <button
                type="button"
                onClick={() => setPayMode('INDIVIDUAL')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  payMode === 'INDIVIDUAL' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                Per lecție
              </button>
            </div>

            {payMode === 'INDIVIDUAL' ? (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Lecții achitate *</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={lessons}
                  onChange={(e) => setLessons(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Plată pentru luna *</label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {periods.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}{o.isCurrent ? ' (curentă)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Data încasării</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <p className="text-[11px] text-gray-500">
            Plata acoperă lecțiile lunii alese pentru această grupă ({defaultLessons} lecții).
            Data încasării rămâne separată — poți plăti în avans sau cu întârziere.
          </p>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Se salvează…' : 'Înregistrează plata'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Anulează
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
