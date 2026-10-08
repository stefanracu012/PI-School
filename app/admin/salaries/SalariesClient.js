'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ChevronRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import {
  KIND_LABELS,
  KIND_STYLES,
  fmtLei,
  fmtSigned,
  fmtBalance,
  fmtDateTime,
  currentMonth,
  monthKey,
  monthLabel,
  parseMonthKey,
  entryDetail,
  MonthPicker,
} from '@/components/salary/salary-ui'

export default function SalariesClient() {
  const [month, setMonth] = useState(monthKey(currentMonth()))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/salaries?month=${month}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eroare la încărcare')
      setData(json)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { load() }, [load])

  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    )
  }

  const label = monthLabel(parseMonthKey(month) || currentMonth())
  const q = search.trim().toLowerCase()
  const rows = data.rows
    .filter((r) => !q || r.name.toLowerCase().includes(q))
    // Cine are bani de primit sau a lucrat luna aceasta, sus
    .sort((a, b) => b.balance - a.balance || b.month.earned - a.month.earned || a.name.localeCompare(b.name))

  return (
    <div className="space-y-4 xs:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl xs:text-2xl font-bold text-gray-900">Salarii</h1>
          <p className="text-sm text-gray-500">Fiecare lecție ținută intră singură în salariul profesorului, după plata setată pe grupă</p>
        </div>
        <MonthPicker value={month} onChange={setMonth} allowAll={false} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 xs:gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 xs:p-5">
          <p className="text-sm text-gray-500">De achitat acum, în total</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{fmtBalance(data.totals.balance)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 xs:p-5">
          <p className="text-sm text-gray-500">Câștigat în {label}</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{fmtLei(data.totals.month.earned)}</p>
          <p className="text-xs text-gray-500 mt-1">{data.totals.month.lessons} lecții · {data.totals.month.bonuses} bonusuri</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 xs:p-5">
          <p className="text-sm text-gray-500">Achitat în {label}</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{fmtLei(data.totals.month.paid)}</p>
        </div>
      </div>

      {/* Profesorii */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="p-4 xs:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="font-semibold text-gray-900">Profesori</h2>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută profesor…"
            className="w-full sm:w-64 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
          />
        </div>

        {/* Pe ecran mare: tabel */}
        <div className={`hidden md:block overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Profesor</th>
                <th className="text-right px-5 py-3 font-medium">Lecții ({label})</th>
                <th className="text-right px-5 py-3 font-medium">Câștigat</th>
                <th className="text-right px-5 py-3 font-medium">Achitat</th>
                <th className="text-right px-5 py-3 font-medium">Sold de primit</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link href={`/admin/salaries/${r.id}`} className="font-medium text-gray-900 hover:text-indigo-600">
                      {r.name}
                    </Link>
                    {!r.active && <span className="ml-2 text-xs text-gray-400">inactiv</span>}
                    {(!r.notified || !r.hasTelegram) && (
                      <span
                        className="ml-2 inline-flex align-middle text-amber-500"
                        title={!r.notified ? 'Nu are „Vede salariul propriu" activat' : 'Nu are Telegram conectat'}
                      >
                        <ExclamationTriangleIcon className="w-4 h-4" />
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-700">{r.month.lessons}</td>
                  <td className="px-5 py-3 text-right text-emerald-600">{fmtLei(r.month.earned)}</td>
                  <td className="px-5 py-3 text-right text-rose-600">{fmtLei(r.month.paid)}</td>
                  <td className={`px-5 py-3 text-right font-bold ${r.balance < 0 ? 'text-rose-600' : 'text-gray-900'}`}>{fmtBalance(r.balance)}</td>
                  <td className="pr-4">
                    <Link href={`/admin/salaries/${r.id}`} className="text-gray-400 hover:text-indigo-600">
                      <ChevronRightIcon className="w-5 h-5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pe telefon: carduri */}
        <ul className={`md:hidden divide-y divide-gray-100 ${loading ? 'opacity-60' : ''}`}>
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/salaries/${r.id}`} className="flex items-center gap-3 p-4 active:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {r.name}
                    {(!r.notified || !r.hasTelegram) && <ExclamationTriangleIcon className="inline w-4 h-4 ml-1 text-amber-500" />}
                  </p>
                  <p className="text-xs text-gray-500">
                    {r.month.lessons} lecții · câștigat {fmtLei(r.month.earned)} · achitat {fmtLei(r.month.paid)}
                  </p>
                </div>
                <p className={`text-lg font-bold ${r.balance < 0 ? 'text-rose-600' : 'text-gray-900'}`}>{fmtBalance(r.balance)}</p>
                <ChevronRightIcon className="w-5 h-5 text-gray-400" />
              </Link>
            </li>
          ))}
        </ul>

        {rows.length === 0 && <p className="p-8 text-center text-sm text-gray-500">Niciun profesor găsit.</p>}
      </div>

      {/* Ultimele mișcări */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="p-4 xs:p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Ultimele mișcări</h2>
          <p className="text-xs text-gray-500">Cele mai noi sus, la toți profesorii</p>
        </div>
        {data.recent.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">Nu e încă nimic. Sumele apar aici când se salvează lecții la grupe cu plata setată.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.recent.map((e) => {
              const detail = entryDetail(e)
              return (
                <li key={e.id}>
                  <Link href={`/admin/salaries/${e.teacherId}`} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 p-4 xs:px-5 hover:bg-gray-50">
                    <span className={`sm:w-28 shrink-0 text-lg font-bold ${e.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {fmtSigned(e.amount)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{e.teacherName || '—'}</span>
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${KIND_STYLES[e.kind]}`}>{KIND_LABELS[e.kind]}</span>
                        <span className="text-sm text-gray-700">{e.reason}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {fmtDateTime(e.date)}
                        {detail && <> · {detail}</>}
                        {e.createdByName && e.kind !== 'LESSON' && e.kind !== 'MAKEUP' && <> · de {e.createdByName}</>}
                      </p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
