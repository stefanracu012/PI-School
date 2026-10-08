'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { ArrowPathIcon, BoltIcon } from '@heroicons/react/24/outline'

/**
 * Comutatorul „conversațiile devin lead-uri", din pagina de Securitate.
 * Se randează doar pentru SUPERADMIN — API-ul refuză oricum pe oricine altcineva.
 */
export default function MetaLeadsToggle() {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastRun, setLastRun] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/meta-leads')
      if (res.status === 403 || res.status === 401) { setState(null); return }
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eroare')
      setState(json)
    } catch {
      setState(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/meta-leads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !state.enabled }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eroare')
      setState(json)
      toast.success(json.enabled
        ? 'Pornit — conversațiile noi devin lead-uri'
        : 'Oprit — nu se mai creează lead-uri din conversații')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const syncNow = async (dryRun = false) => {
    setSyncing(true)
    setLastRun(null)
    try {
      const res = await fetch(`/api/admin/meta-leads${dryRun ? '?dry=1' : ''}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eroare')
      if (!json.dryRun) {
        setState((prev) => ({ ...prev, lastSyncAt: json.lastSyncAt, totalCreated: json.totalCreated }))
      }
      setLastRun(json)
      toast.success(
        json.dryRun
          ? `${json.created} conversații ar deveni lead-uri`
          : json.created > 0
            ? `${json.created} lead-uri noi din conversații`
            : 'Nicio conversație nouă de transformat'
      )
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSyncing(false)
    }
  }

  if (loading || !state) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BoltIcon className="h-5 w-5 text-indigo-600" />
            Conversațiile devin lead-uri
            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[11px] font-medium">
              doar superadmin
            </span>
          </h2>
          <p className="text-sm text-gray-600 mt-1 max-w-xl">
            Cât timp e pornit, fiecare conversație nouă de pe Messenger și Instagram intră
            automat în lista de lead-uri, cu numele persoanei, sursa, primul mesaj și — dacă
            l-a scris — telefonul. Se iau cele mai recente 25 de conversații de pe fiecare
            platformă, nu tot istoricul, iar una deja transformată nu se repetă niciodată.
            <b className="text-gray-700"> Prima sincronizare nu trimite nimic pe Telegram</b>;
            notificările pornesc de la conversațiile care apar după ea.
          </p>
        </div>

        <button
          type="button"
          onClick={toggle}
          disabled={saving}
          className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors disabled:opacity-60 ${
            state.enabled ? 'bg-indigo-600' : 'bg-gray-300'
          }`}
          aria-pressed={state.enabled}
          aria-label="Pornește sau oprește"
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
              state.enabled ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600">
        <span>
          Stare:{' '}
          <b className={state.enabled ? 'text-emerald-600' : 'text-gray-500'}>
            {state.enabled ? 'pornit' : 'oprit'}
          </b>
        </span>
        <span>
          Lead-uri create până acum: <b className="text-gray-900">{state.totalCreated}</b>
        </span>
        <span>
          Ultima sincronizare:{' '}
          <b className="text-gray-900">
            {state.lastSyncAt
              ? new Date(state.lastSyncAt).toLocaleString('ro-RO', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  timeZone: 'Europe/Chisinau',
                })
              : 'niciodată'}
          </b>
        </span>
      </div>

      {!state.tokenConfigured && (
        <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          META_ACCESS_TOKEN nu e setat, deci sincronizarea nu are de unde citi conversațiile.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => syncNow(true)}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          👀 Vezi ce s-ar crea
        </button>
        <span className="text-xs text-gray-500">
          Fără să scrie nimic — doar îți arată lista.
        </span>
      </div>

      {state.enabled && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => syncNow(false)}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Se sincronizează…' : 'Sincronizează acum'}
          </button>
          <span className="text-xs text-gray-500">
            Automat se face oricum la fiecare 15 minute.
          </span>
        </div>
      )}

      {lastRun && (
        <div className="mt-3 text-sm border border-gray-100 rounded-lg p-3 bg-gray-50">
          <p className="text-gray-900 font-medium">
            {lastRun.dryRun
              ? `${lastRun.created} conversații ar deveni lead-uri`
              : `${lastRun.created} lead-uri noi`}
            <span className="font-normal text-gray-500">
              {' '}· {lastRun.skipped?.existing || 0} conversații erau deja lead
            </span>
            {lastRun.dryRun && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 text-[10px]">
                nimic nu s-a salvat
              </span>
            )}
          </p>
          {lastRun.createdLeads?.length > 0 && (
            <ul className="mt-1 text-xs text-gray-600 space-y-0.5">
              {lastRun.createdLeads.slice(0, 25).map((l) => (
                <li key={l.id}>
                  • {l.name} <span className="text-gray-400">({l.platform})</span>
                  {l.phone && <span className="text-emerald-600"> · {l.phone}</span>}
                  {l.status && <span className="text-gray-400"> · {l.status}</span>}
                </li>
              ))}
            </ul>
          )}
          {lastRun.errors?.length > 0 && (
            <ul className="mt-1 text-xs text-red-600 list-disc list-inside">
              {lastRun.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
