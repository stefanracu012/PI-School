'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { BoltIcon } from '@heroicons/react/24/outline'

/**
 * Înregistrarea webhook-ului botului Telegram direct din Securitate (doar SUPERADMIN).
 * Fără webhook, butoanele din mesajele botului nu fac nimic și linkul „Conectează Telegram"
 * nu leagă contul. Butonul setează webhook-ul pe domeniul de pe care e apăsat.
 */

const STEP_LABELS = [['dns', 'DNS'], ['tcp', 'Conexiune'], ['tls', 'TLS'], ['http', 'Răspuns']]

// Rândul de diagnostic pentru un host: unde s-a oprit drumul serverului până la el
function ProbeRow({ label, probe }) {
  if (!probe) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="w-28 shrink-0 text-gray-500">{label}</span>
      {STEP_LABELS.map(([key, name]) => {
        const s = probe[key]
        if (!s) return <span key={key} className="text-gray-300">{name} —</span>
        return (
          <span key={key} className={s.ok ? 'text-emerald-700' : 'text-red-700 font-medium'}>
            {name} {s.ok ? '✓' : '✗'} {s.ok ? `${s.ms} ms` : s.error}
          </span>
        )
      })}
    </div>
  )
}

function BotApiRow({ label, probe }) {
  if (!probe) return null
  const text = probe.ok
    ? `✓ răspuns în ${probe.ms} ms${probe.username ? ` (@${probe.username})` : ''}`
    : probe.answered
      ? `răspuns în ${probe.ms} ms: ${probe.errorCode || ''} ${probe.error || ''}`
      : `✗ fără răspuns (${probe.error})`
  return (
    <div className="flex flex-wrap gap-x-3">
      <span className="w-28 shrink-0 text-gray-500">{label}</span>
      <span className={probe.answered ? 'text-gray-800' : 'text-red-700 font-medium'}>{text}</span>
    </div>
  )
}

function Diagnostic({ data }) {
  if (!data) return null
  return (
    <div className="mt-4 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 space-y-1">
      <p className="font-medium text-gray-700">
        Diagnostic din server{data.region ? ` (regiunea Vercel ${data.region})` : ''}:
      </p>
      <ProbeRow label="api.telegram.org" probe={data.telegram} />
      <ProbeRow label="control (GitHub)" probe={data.control} />
      {data.token && (
        <p className={data.token.validFormat ? 'text-emerald-700' : 'text-red-700 font-medium'}>
          Token: {!data.token.present
            ? 'lipsește'
            : data.token.validFormat
              ? `format corect (${data.token.length} caractere)`
              : `format greșit (${data.token.length} caractere${data.token.hasQuotes ? ', are ghilimele' : ''}${data.token.hasWhitespace ? ', are spații' : ''}${data.token.startsWithBot ? ', începe cu „bot"' : ''}) — trebuie să arate ca 1234567890:AAH…`}
        </p>
      )}
      <BotApiRow label="Bot API, token fals" probe={data.botApiFakeToken} />
      <BotApiRow label="Bot API, tokenul tău" probe={data.botApiRealToken} />
    </div>
  )
}

const formatDate = (iso) =>
  new Date(iso).toLocaleString('ro-RO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Chisinau',
  })

export default function TelegramWebhook() {
  const [status, setStatus] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [isHttps, setIsHttps] = useState(true)
  const [diagnostic, setDiagnostic] = useState(null)

  useEffect(() => { setIsHttps(window.location.protocol === 'https:') }, [])

  const load = useCallback(async () => {
    try {
      // Serverul se oprește singur după cel mult ~25 s (cu diagnostic); 45 s e plasa de siguranță
      const res = await fetch('/api/admin/telegram/webhook', {
        cache: 'no-store',
        signal: AbortSignal.timeout(45000),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Eroare ${res.status}`)
      setStatus(data)
      setDiagnostic(data.diagnostic || null)
      setLoadError(null)
    } catch (err) {
      setLoadError(
        err.name === 'TimeoutError' || err.name === 'AbortError'
          ? 'serverul nu a răspuns la timp'
          : err.message
      )
    }
  }, [])

  useEffect(() => { load() }, [load])

  const setWebhook = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/telegram/webhook', {
        method: 'POST',
        signal: AbortSignal.timeout(45000),
      })
      const data = await res.json().catch(() => ({}))
      if (data.diagnostic) setDiagnostic(data.diagnostic)
      if (!res.ok) throw new Error(data.error || `Eroare ${res.status}`)
      toast.success('Webhook setat — botul răspunde acum')
      await load()
    } catch (err) {
      toast.error(
        err.name === 'TimeoutError' || err.name === 'AbortError'
          ? 'Serverul nu a răspuns la timp. Încearcă din nou.'
          : err.message
      )
    } finally {
      setBusy(false)
    }
  }

  const webhook = status?.webhook
  const ok = !!webhook?.active && webhook.matchesThisSite && !webhook.lastError

  let badge = null
  if (webhook) {
    badge = ok
      ? { text: 'Funcționează', cls: 'bg-emerald-100 text-emerald-800' }
      : !webhook.active
        ? { text: 'Nesetat', cls: 'bg-red-100 text-red-800' }
        : { text: 'Necesită atenție', cls: 'bg-amber-100 text-amber-800' }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BoltIcon className="h-5 w-5 text-indigo-600" />
            Webhook Telegram
            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[11px] font-medium">
              doar superadmin
            </span>
          </h2>
          <p className="text-sm text-gray-600 mt-1 max-w-xl">
            Dacă botul nu răspunde — butoanele din mesaje nu fac nimic sau „Conectează Telegram&rdquo; nu
            leagă contul — apasă butonul de mai jos. Webhook-ul se setează pe site-ul de pe care ești
            conectat acum.
          </p>
        </div>
        {badge && (
          <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${badge.cls}`}>
            {badge.text}
          </span>
        )}
      </div>

      {loadError && (
        <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Nu am putut citi starea webhook-ului: {loadError}. Poți încerca totuși „Setează webhook&rdquo;.
        </p>
      )}
      {!status && !loadError && <div className="mt-4 h-16 bg-gray-100 rounded-lg animate-pulse" />}

      {status && (
        <>
          {!status.botConfigured && (
            <p className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Lipsește <code>TELEGRAM_LESSONS_BOT_TOKEN</code> din variabilele de mediu — fără el nu
              se poate seta webhook-ul.
            </p>
          )}
          {status.botConfigured && !status.secretConfigured && (
            <p className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <code>TELEGRAM_WEBHOOK_SECRET</code> nu e setat — webhook-ul ar accepta cereri de la
              oricine. Adaugă-l în variabilele de mediu și apoi apasă din nou butonul.
            </p>
          )}
          {status.telegramError && (
            <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Telegram: {status.telegramError}
            </p>
          )}

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex flex-wrap gap-x-2">
              <span className="text-gray-500">Bot:</span>
              <b className="text-gray-900">
                {status.bot?.username ? `@${status.bot.username}` : '—'}
              </b>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <span className="text-gray-500">Setat acum:</span>
              <b className="text-gray-900 break-all">
                {webhook?.url || 'nimic'}
              </b>
            </div>
            {webhook?.active && !webhook.matchesThisSite && (
              <p className="text-amber-700">
                Diferă de adresa acestui site ({status.target}). Apasă butonul ca să-l muți aici.
              </p>
            )}
            {webhook?.active && (
              <div className="flex flex-wrap gap-x-2">
                <span className="text-gray-500">În așteptare:</span>
                <b className="text-gray-900">{webhook.pendingUpdates} mesaje</b>
              </div>
            )}
            {webhook?.lastError && (
              <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Ultima eroare de la Telegram: {webhook.lastError}
                {webhook.lastErrorDate ? ` (${formatDate(webhook.lastErrorDate)})` : ''}
              </p>
            )}
          </div>
        </>
      )}

      {!isHttps && (
        <p className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Ești pe o adresă fără https (probabil localhost). Telegram acceptă webhook doar pe
          https — deschide site-ul publicat și apasă butonul de acolo.
        </p>
      )}

      <Diagnostic data={diagnostic} />

      {/* Butoanele rămân mereu la îndemână, chiar dacă starea nu s-a putut citi */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={setWebhook}
          disabled={busy || !isHttps || status?.botConfigured === false}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <BoltIcon className={`h-4 w-4 ${busy ? 'animate-pulse' : ''}`} />
          {busy ? 'Se setează…' : webhook?.active ? 'Resetează webhook' : 'Setează webhook'}
        </button>
        <button
          type="button"
          onClick={load}
          disabled={busy}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          Verifică starea
        </button>
      </div>
    </div>
  )
}
