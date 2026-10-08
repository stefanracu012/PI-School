'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  ArrowLeftIcon,
  GiftIcon,
  PencilSquareIcon,
  BanknotesIcon,
  TrashIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
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
  salaryRuleLabel,
  entryDetail,
  MonthPicker,
} from './salary-ui'

/**
 * Fișa de salariu a unui profesor. Aceeași pagină pentru admin (cu butoanele
 * pe care i le permit drepturile) și pentru profesor (doar citire).
 */
export default function TeacherSalaryView({ apiUrl, backHref = null, adminView = false }) {
  const [period, setPeriod] = useState(monthKey(currentMonth()))
  const [showDeleted, setShowDeleted] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { kind: 'BONUS'|'PAYOUT'|'ADJUSTMENT'|'EDIT', entry? }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ period })
      if (showDeleted) params.set('deleted', '1')
      const res = await fetch(`${apiUrl}?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eroare la încărcare')
      setData(json)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [apiUrl, period, showDeleted])

  useEffect(() => { load() }, [load])

  const access = data?.access || {}

  const cancelEntry = async (entry) => {
    if (!confirm(`Anulezi ${fmtSigned(entry.amount)} — „${entry.reason}"?\n\nRămâne în istoric ca anulată, dar nu mai contează în sold. Profesorul primește mesaj.`)) return
    const res = await fetch(`/api/admin/salaries/${entry.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) return toast.error(json.error || 'Nu s-a putut anula')
    toast.success('Suma a fost anulată')
    load()
  }

  if (!data && loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    )
  }
  if (!data) return null

  const { teacher, stats, entries, groups, periodSummary } = data
  const now = currentMonth()

  return (
    <div className="space-y-4 xs:space-y-6">
      {/* Antet */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          {backHref && (
            <Link href={backHref} className="p-2 rounded-lg hover:bg-gray-200 text-gray-600" aria-label="Înapoi">
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
          )}
          <div>
            <h1 className="text-xl xs:text-2xl font-bold text-gray-900">
              {adminView ? teacher.name : 'Salariul meu'}
            </h1>
            <p className="text-sm text-gray-500">
              {adminView ? 'Salariul profesorului, cu fiecare sumă' : 'Fiecare sumă care intră sau iese din salariul tău'}
            </p>
          </div>
        </div>

        {access.edit && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setModal({ kind: 'BONUS' })} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600">
              <GiftIcon className="w-4 h-4" /> Bonus
            </button>
            <button onClick={() => setModal({ kind: 'ADJUSTMENT' })} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
              <PencilSquareIcon className="w-4 h-4" /> Corectare ±
            </button>
            <button onClick={() => setModal({ kind: 'PAYOUT' })} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
              <BanknotesIcon className="w-4 h-4" /> Scoate salariul
            </button>
          </div>
        )}
      </div>

      {adminView && (!teacher.hasTelegram || !teacher.notified) && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800">
          <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
          <span>
            {!teacher.notified
              ? 'Profesorul nu are „Vede salariul propriu" activat — nu primește mesaje despre sume și nu are pagina „Salariul meu". Se activează la permisiunile lui, în Personal.'
              : 'Profesorul nu are Telegram conectat — vede sumele în CRM, dar nu primește mesaj în privat.'}
          </span>
        </div>
      )}

      {/* Cifrele mari */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 xs:gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 xs:p-5">
          <p className="text-sm text-gray-500">Sold de primit</p>
          <p className={`text-3xl font-bold mt-1 ${stats.balance < 0 ? 'text-rose-600' : 'text-gray-900'}`}>{fmtBalance(stats.balance)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 xs:p-5">
          <p className="text-sm text-gray-500">{monthLabel(now)}</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{fmtLei(stats.month.earned)}</p>
          <p className="text-xs text-gray-500 mt-1">
            câștigat · {stats.month.lessons} lecții{stats.month.bonuses ? ` · ${stats.month.bonuses} bonusuri` : ''} · achitat {fmtLei(stats.month.paid)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 xs:p-5">
          <p className="text-sm text-gray-500">De la început</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmtLei(stats.total.earned)}</p>
          <p className="text-xs text-gray-500 mt-1">câștigat · {stats.total.lessons} lecții · achitat {fmtLei(stats.total.paid)}</p>
        </div>
      </div>

      {/* Grupele și regula lor */}
      {groups.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 xs:p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Grupe și plata pe lecție</h2>
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => {
              const unset = !g.salaryType || !(g.salaryAmount > 0)
              const chip = (
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border ${unset ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                  <span className="font-medium">{g.name}</span> — {salaryRuleLabel(g.salaryType, g.salaryAmount)}
                </span>
              )
              return adminView ? <Link key={g.id} href={`/admin/groups/${g.id}`}>{chip}</Link> : <span key={g.id}>{chip}</span>
            })}
          </div>
          {adminView && groups.some((g) => !g.salaryType || !(g.salaryAmount > 0)) && (
            <p className="text-xs text-gray-500 mt-2">Grupele „nesetat” nu adaugă nimic la salariu — apasă pe grupă ca s-o setezi.</p>
          )}
        </div>
      )}

      {/* Istoricul */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="p-4 xs:p-5 border-b border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <MonthPicker value={period} onChange={setPeriod} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-gray-500">Câștigat <b className="text-emerald-600">{fmtLei(periodSummary.earned)}</b></span>
            <span className="text-gray-500">Achitat <b className="text-rose-600">{fmtLei(periodSummary.paid)}</b></span>
            {adminView && (
              <label className="inline-flex items-center gap-1.5 text-gray-600 cursor-pointer">
                <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} className="rounded border-gray-300 text-indigo-600" />
                Arată anulate
              </label>
            )}
          </div>
        </div>

        {entries.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">Nicio sumă în perioada aceasta.</p>
        ) : (
          <ul className={`divide-y divide-gray-100 ${loading ? 'opacity-60' : ''}`}>
            {entries.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                canEdit={access.edit}
                canDelete={access.delete}
                onEdit={() => setModal({ kind: 'EDIT', entry: e })}
                onDelete={() => cancelEntry(e)}
              />
            ))}
          </ul>
        )}
        {data.truncated && <p className="p-3 text-xs text-gray-500 text-center">Se arată primele 1000 de rânduri — alege o lună pentru restul.</p>}
      </div>

      {modal && (
        <AmountModal
          modal={modal}
          teacher={teacher}
          balance={stats.balance}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}

function EntryRow({ entry, canEdit, canDelete, onEdit, onDelete }) {
  const detail = entryDetail(entry)
  const negative = entry.amount < 0
  return (
    <li className={`p-4 xs:px-5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 ${entry.deleted ? 'bg-gray-50' : ''}`}>
      <div className={`sm:w-32 shrink-0 text-xl font-bold ${entry.deleted ? 'line-through text-gray-400' : negative ? 'text-rose-600' : 'text-emerald-600'}`}>
        {fmtSigned(entry.amount)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${KIND_STYLES[entry.kind]}`}>{KIND_LABELS[entry.kind]}</span>
          <span className={`text-sm font-medium ${entry.deleted ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{entry.reason}</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {fmtDateTime(entry.date)}
          {detail && <> · {detail}</>}
          {entry.createdByName && entry.kind !== 'LESSON' && entry.kind !== 'MAKEUP' && <> · de {entry.createdByName}</>}
          {entry.editedAt && <> · editat{entry.editedByName ? ` de ${entry.editedByName}` : ''}</>}
        </p>
        {entry.deleted && (
          <p className="text-xs text-rose-600 mt-0.5">
            Anulat{entry.deletedByName ? ` de ${entry.deletedByName}` : ''}{entry.deletedAt ? `, ${fmtDateTime(entry.deletedAt)}` : ''}
          </p>
        )}
      </div>
      {!entry.deleted && (canEdit || canDelete) && (
        <div className="flex gap-1 shrink-0">
          {canEdit && (
            <button onClick={onEdit} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-indigo-600" title="Editează">
              <PencilSquareIcon className="w-5 h-5" />
            </button>
          )}
          {canDelete && (
            <button onClick={onDelete} className="p-2 rounded-lg text-gray-500 hover:bg-rose-50 hover:text-rose-600" title="Anulează">
              <TrashIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      )}
    </li>
  )
}

const MODAL_TITLES = {
  BONUS: 'Adaugă bonus',
  ADJUSTMENT: 'Corectare',
  PAYOUT: 'Scoate salariul',
  EDIT: 'Editează suma',
}

function AmountModal({ modal, teacher, balance, onClose, onSaved }) {
  const { kind, entry } = modal
  const isEdit = kind === 'EDIT'
  const effectiveKind = isEdit ? entry.kind : kind

  const [amount, setAmount] = useState(() => {
    if (isEdit) return String(Math.abs(entry.amount))
    if (kind === 'PAYOUT' && balance > 0) return String(Math.round(balance * 100) / 100)
    return ''
  })
  const [negative, setNegative] = useState(isEdit ? entry.amount < 0 : false)
  const [reason, setReason] = useState(() => {
    if (isEdit) return entry.reason
    if (kind === 'PAYOUT') return `Salariu ${monthLabel(currentMonth()).toLowerCase()}`
    return ''
  })
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const value = Math.abs(parseFloat(String(amount).replace(',', '.')))
      const signed = effectiveKind === 'ADJUSTMENT' && negative ? -value : value
      const res = isEdit
        ? await fetch(`/api/admin/salaries/${entry.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: signed, reason }),
          })
        : await fetch('/api/admin/salaries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teacherId: teacher.id, kind, amount: signed, reason }),
          })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Nu s-a putut salva')
      toast.success(
        teacher.notified && teacher.hasTelegram
          ? 'Salvat — profesorul a primit mesaj'
          : 'Salvat'
      )
      onSaved()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const hints = {
    BONUS: 'De exemplu o lecție ținută, dar nepusă în sistem.',
    ADJUSTMENT: 'Plus sau minus, cu motiv — de exemplu un avans dat în numerar.',
    PAYOUT: `Se scade din sold. Sold acum: ${fmtBalance(balance)}.`,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-4"
      >
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{MODAL_TITLES[kind]}</h3>
          <p className="text-sm text-gray-500">{teacher.name}{isEdit ? ` · ${KIND_LABELS[entry.kind]}` : ''}</p>
          {!isEdit && <p className="text-xs text-gray-500 mt-1">{hints[kind]}</p>}
          {isEdit && (entry.kind === 'LESSON' || entry.kind === 'MAKEUP') && (
            <p className="text-xs text-amber-700 mt-1">După editare, suma nu se mai recalculează când se corectează prezența.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Suma (lei)</label>
          <div className="flex gap-2">
            {effectiveKind === 'ADJUSTMENT' && (
              <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden shrink-0">
                <button type="button" onClick={() => setNegative(false)} className={`px-3 text-lg ${!negative ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600'}`}>+</button>
                <button type="button" onClick={() => setNegative(true)} className={`px-3 text-lg ${negative ? 'bg-rose-600 text-white' : 'bg-white text-gray-600'}`}>−</button>
              </div>
            )}
            <input
              type="number"
              min="0"
              step="any"
              required
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {effectiveKind === 'PAYOUT' ? 'Mesaj' : 'Motiv'}
            {effectiveKind === 'ADJUSTMENT' ? ' *' : ''}
          </label>
          <input
            type="text"
            maxLength={300}
            required={effectiveKind === 'ADJUSTMENT'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={effectiveKind === 'BONUS' ? 'Lecție cu grupa Kids din 03.10, nepusă în sistem' : ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            Renunță
          </button>
          <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Se salvează…' : 'Salvează'}
          </button>
        </div>
      </form>
    </div>
  )
}
