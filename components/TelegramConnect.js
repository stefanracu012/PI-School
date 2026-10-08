'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

/**
 * Conectarea contului la botul de Telegram, fără chat ID-uri copiate manual.
 * Butonul generează un link t.me/<bot>?start=<token>; la apăsarea lui Start,
 * webhook-ul scrie chat ID-ul pe contul curent.
 */
export default function TelegramConnect() {
  const [state, setState] = useState(null)   // { connected, username, botConfigured }
  const [link, setLink] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const res = await fetch('/api/telegram/link')
      if (res.ok) setState(await res.json())
    } catch {
      setState({ connected: false, botConfigured: true })
    }
  }

  useEffect(() => { load() }, [])

  // Cât timp linkul e deschis, verificăm periodic dacă s-a apăsat Start
  useEffect(() => {
    if (!link || state?.connected) return
    const t = setInterval(async () => {
      const res = await fetch('/api/telegram/link')
      if (!res.ok) return
      const data = await res.json()
      if (data.connected) {
        setState(data)
        setLink(null)
        toast.success('Cont conectat la Telegram')
      }
    }, 3000)
    return () => clearInterval(t)
  }, [link, state?.connected])

  const generate = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/telegram/link', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare la generarea linkului')
      setLink(data)
      window.open(data.url, '_blank', 'noopener')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!confirm('Deconectezi contul de la Telegram? Nu vei mai primi notificări.')) return
    setBusy(true)
    try {
      const res = await fetch('/api/telegram/link', { method: 'DELETE' })
      if (!res.ok) throw new Error('Eroare la deconectare')
      setState({ ...state, connected: false, username: null })
      setLink(null)
      toast.success('Cont deconectat')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            ✈️ Telegram
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Conectează-ți contul ca să primești notificările tale direct în Telegram.
          </p>
        </div>
        {state?.connected && (
          <span className="shrink-0 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-medium">
            Conectat
          </span>
        )}
      </div>

      {state === null ? (
        <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
      ) : state.botConfigured === false ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Botul nu e configurat: lipsește <code>NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</code> din
          variabilele de mediu.
        </p>
      ) : state.connected ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-gray-700">
            Primești notificări în Telegram
            {state.username ? <> pe contul <b>@{state.username}</b></> : null}.
          </p>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            Deconectează
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {busy ? 'Se generează…' : 'Conectează Telegram'}
          </button>

          {link && (
            <div className="text-sm text-gray-600 space-y-2 border border-indigo-200 bg-indigo-50/50 rounded-lg p-3">
              <p>
                S-a deschis Telegram — apasă <b>Start</b> în conversația cu botul.
                Rămâi pe pagină, se conectează singur.
              </p>
              <p className="break-all">
                Dacă nu s-a deschis, folosește linkul:{' '}
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">
                  {link.url}
                </a>
              </p>
              <p className="text-xs text-gray-500">
                Linkul e de unică folosință și expiră în {link.expiresInMinutes} de minute.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
