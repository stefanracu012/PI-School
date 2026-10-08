'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { XMarkIcon } from '@heroicons/react/24/outline'

const STATUS_LABEL = {
  STUDIAZA: '🟣 Studiază',
  WAITLIST: '📋 Waitlist',
  PLECAT: '🔴 A plecat',
}

/**
 * Lead pentru fiecare elev existent — doar pentru superadmin.
 * Întâi arată ce s-ar face, abia apoi face. Rulat de mai multe ori, nu
 * dublează nimic: elevii care au deja lead sunt doar verificați.
 */
export default function StudentLeadsSync() {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/students/sync-leads')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eroare')
      setPreview(json)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/students/sync-leads', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eroare')
      setResult(json)
      setPreview(null)
      toast.success(`${json.created} lead-uri noi · ${json.linked} legate · ${json.updated} actualizate`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const openPanel = () => { setOpen(true); load() }

  const data = result || preview
  const nothingToDo = data && data.created + data.linked + data.updated === 0

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="px-3 xs:px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        title="Creează lead pentru fiecare elev, fără dubluri"
      >
        🎓 Leads din elevi
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Leads din elevi</h2>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="p-1 rounded hover:bg-gray-100 text-gray-500">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 text-sm">
              <p className="text-gray-600">
                Fiecare elev primește un lead cu sursa <b>🎓 Pagina Elevi</b>. Statusul vine din grupe:
                în grupă activă → <b>Studiază</b>, fără grupă → <b>Waitlist</b>, plecat din toate
                grupele → <b>A plecat</b>. Dacă există deja un lead cu același telefon sau același
                nume, e <b>legat</b>, nu dublat.
              </p>

              {busy && !data && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                </div>
              )}

              {data && (
                <>
                  {result && (
                    <p className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium">
                      Gata. Toți elevii au acum lead-ul lor.
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <Stat label={result ? 'Lead-uri create' : 'Lead-uri noi'} value={data.created} tone="indigo" />
                    <Stat label={result ? 'Legate' : 'De legat (existau)'} value={data.linked} tone="emerald" />
                    <Stat label={result ? 'Actualizate' : 'Status de schimbat'} value={data.updated} tone="amber" />
                    <Stat label="Deja în regulă" value={data.unchanged} tone="gray" />
                  </div>

                  <div className="text-xs text-gray-600">
                    <p className="font-medium text-gray-800 mb-1">Din {data.students} elevi:</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(data.byStatus || {}).map(([k, v]) => (
                        <span key={k} className="px-2 py-1 rounded bg-gray-100">
                          {STATUS_LABEL[k] || k}: <b>{v}</b>
                        </span>
                      ))}
                    </div>
                  </div>

                  {!result && data.samples?.link?.length > 0 && (
                    <Sample
                      title="Se leagă de lead-uri existente (nu se dublează)"
                      rows={data.samples.link.map((r) => `${r.student} ↔ ${r.lead} → ${STATUS_LABEL[r.status] || r.status}`)}
                    />
                  )}
                  {!result && data.samples?.create?.length > 0 && (
                    <Sample
                      title="Primesc lead nou"
                      rows={data.samples.create.map((r) => `${r.student} → ${STATUS_LABEL[r.status] || r.status}`)}
                    />
                  )}

                  {data.errors?.length > 0 && (
                    <ul className="text-xs text-red-600 list-disc list-inside">
                      {data.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}

                  {!result && (
                    nothingToDo ? (
                      <p className="text-gray-500">Nimic de făcut — toți elevii au deja lead-ul potrivit.</p>
                    ) : (
                      <button
                        type="button"
                        onClick={apply}
                        disabled={busy}
                        className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {busy ? 'Se aplică…' : 'Aplică'}
                      </button>
                    )
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Stat({ label, value, tone }) {
  const tones = {
    indigo: 'text-indigo-700 bg-indigo-50',
    emerald: 'text-emerald-700 bg-emerald-50',
    amber: 'text-amber-700 bg-amber-50',
    gray: 'text-gray-700 bg-gray-50',
  }
  return (
    <div className={`rounded-lg px-3 py-2 ${tones[tone]}`}>
      <p className="text-[11px] opacity-80">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  )
}

function Sample({ title, rows }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-800 mb-1">{title}</p>
      <ul className="text-xs text-gray-600 space-y-0.5 max-h-32 overflow-y-auto">
        {rows.map((r, i) => <li key={i}>• {r}</li>)}
      </ul>
    </div>
  )
}
