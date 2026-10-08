'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { ArrowDownTrayIcon, CircleStackIcon, FolderOpenIcon } from '@heroicons/react/24/outline'

/**
 * Backup complet al bazei de date pe calculator, din pagina de Securitate (doar SUPERADMIN).
 *
 * Prima dată alegi un folder (de ex. Documente); în el apare „PI-School-CRM-Backup", cu câte un
 * subfolder pe zi: 2026-10-02/Lead.json, Student.json … + _info.json. Un backup repetat în
 * aceeași zi actualizează folderul zilei. Se păstrează ultimele 30 de zile.
 * Restaurare: npm run db:restore -- "<calea către folderul zilei>"
 *
 * Scrierea pe disc o face browserul (File System Access API) — merge în Chrome, Edge, Opera.
 */

const ROOT_NAME = 'PI-School-CRM-Backup'
const KEEP_DAYS = 30
const LAST_KEY = 'pischool-backup-last'

// Folderul ales se ține minte în IndexedDB — localStorage nu poate păstra acces la foldere
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('pischool-backup', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('handles')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('handles', mode)
      const req = fn(tx.objectStore('handles'))
      tx.oncomplete = () => { db.close(); resolve(req.result) }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
  })
}
const loadFolder = () => idb('readonly', (s) => s.get('folder')).catch(() => null)
const saveFolder = (handle) => idb('readwrite', (s) => s.put(handle, 'folder')).catch(() => {})

function readLast() {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY))
  } catch {
    return null
  }
}

function writeLast(value) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(value))
  } catch {}
}

async function getJson(url) {
  const res = await fetch(url)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Eroare ${res.status}`)
  return json
}

// Scrie o colecție pagină cu pagină. Dacă ceva pică, fișierul vechi rămâne neatins.
async function writeCollection(dir, name, onDocs) {
  const file = await dir.getFileHandle(`${name}.json`, { create: true })
  const out = await file.createWritable()
  try {
    let count = 0
    let after = null
    await out.write('[')
    do {
      const qs = new URLSearchParams({ collection: name })
      if (after) qs.set('after', after)
      const page = await getJson(`/api/admin/backup?${qs}`)
      if (page.docs.length) {
        await out.write((count ? ',\n' : '\n') + page.docs.map((d) => JSON.stringify(d)).join(',\n'))
        count += page.docs.length
        onDocs(page.docs.length)
      }
      after = page.next
    } while (after)
    await out.write('\n]\n')
    await out.close()
    return count
  } catch (err) {
    await out.abort().catch(() => {})
    throw err
  }
}

async function pruneOldDays(root) {
  const days = []
  for await (const [name, handle] of root.entries()) {
    if (handle.kind === 'directory' && /^\d{4}-\d{2}-\d{2}$/.test(name)) days.push(name)
  }
  days.sort()
  for (const name of days.slice(0, -KEEP_DAYS)) {
    await root.removeEntry(name, { recursive: true })
  }
}

const formatDate = (iso) =>
  new Date(iso).toLocaleString('ro-RO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Chisinau',
  })

export default function DatabaseBackup() {
  const [supported, setSupported] = useState(true)
  const [folder, setFolder] = useState(null)
  const [last, setLast] = useState(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const canWrite = 'showDirectoryPicker' in window
      const handle = canWrite ? await loadFolder() : null
      if (cancelled) return
      setSupported(canWrite)
      setFolder(handle || null)
      setLast(readLast())
    })()
    return () => { cancelled = true }
  }, [])

  const pickFolder = async () => {
    const handle = await window.showDirectoryPicker({ id: 'pischool-backup', mode: 'readwrite', startIn: 'documents' })
    await saveFolder(handle)
    setFolder(handle)
    return handle
  }

  const changeFolder = async () => {
    try {
      await pickFolder()
    } catch (err) {
      if (err.name !== 'AbortError') toast.error(err.message)
    }
  }

  const runBackup = async () => {
    setRunning(true)
    setProgress(null)
    try {
      const parent = folder || await pickFolder()
      if ((await parent.requestPermission({ mode: 'readwrite' })) !== 'granted') {
        throw new Error('Browserul nu a primit voie să scrie în folder')
      }
      const root = parent.name === ROOT_NAME
        ? parent
        : await parent.getDirectoryHandle(ROOT_NAME, { create: true })
      const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Chisinau' })
      const dayDir = await root.getDirectoryHandle(day, { create: true })
      // _info.json se scrie ultimul — dacă lipsește, backup-ul zilei e incomplet
      await dayDir.removeEntry('_info.json').catch(() => {})

      const { database, collections } = await getJson('/api/admin/backup')
      const total = collections.reduce((sum, c) => sum + c.count, 0)
      let done = 0
      const saved = {}
      for (const { name } of collections) {
        setProgress({ done, total, current: name })
        saved[name] = await writeCollection(dayDir, name, (n) => {
          done += n
          setProgress({ done, total, current: name })
        })
      }

      const createdAt = new Date().toISOString()
      const info = await dayDir.getFileHandle('_info.json', { create: true })
      const out = await info.createWritable()
      await out.write(JSON.stringify({
        createdAt,
        database,
        format: 'MongoDB Extended JSON (canonic), câte un array per colecție',
        restore: `npm run db:restore -- "<calea către ${ROOT_NAME}/${day}>"`,
        collections: saved,
      }, null, 2))
      await out.close()

      await pruneOldDays(root)

      const result = { at: createdAt, documents: done, collections: collections.length, path: `${root.name}/${day}` }
      writeLast(result)
      setLast(result)
      toast.success(`Backup salvat: ${done} înregistrări în ${root.name}/${day}`)
    } catch (err) {
      if (err.name === 'NotFoundError') {
        setFolder(null)
        toast.error('Folderul ales nu mai există — apasă din nou și alege altul')
      } else if (err.name !== 'AbortError') {
        toast.error(err.message)
      }
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const daysSinceLast = last ? Math.floor((Date.now() - new Date(last.at)) / 86_400_000) : null
  const percent = progress?.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <CircleStackIcon className="h-5 w-5 text-indigo-600" />
        Backup baza de date
        <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[11px] font-medium">
          doar superadmin
        </span>
      </h2>
      <p className="text-sm text-gray-600 mt-1 max-w-xl">
        Salvează toată baza de date pe calculatorul tău, câte un fișier <b className="text-gray-700">.json</b> pentru
        fiecare tabel. Prima dată alegi unde (de ex. Documente) — acolo apare folderul{' '}
        <b className="text-gray-700">{ROOT_NAME}</b>, cu un subfolder pentru fiecare zi. Dacă apeși de mai
        multe ori în aceeași zi, se actualizează folderul zilei. Se păstrează ultimele {KEEP_DAYS} de zile.
      </p>

      {!supported ? (
        <p className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Browserul ăsta nu poate scrie în foldere. Deschide pagina în Chrome, Edge sau Opera.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600">
            <span>
              Folder:{' '}
              <b className="text-gray-900">
                {folder ? (folder.name === ROOT_NAME ? folder.name : `${folder.name}/${ROOT_NAME}`) : 'nu e ales încă'}
              </b>
            </span>
            <span>
              Ultimul backup:{' '}
              <b className={daysSinceLast === null || daysSinceLast >= 7 ? 'text-amber-600' : 'text-gray-900'}>
                {last ? `${formatDate(last.at)} · ${last.documents} înregistrări` : 'niciodată (din browserul ăsta)'}
              </b>
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runBackup}
              disabled={running}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              <ArrowDownTrayIcon className={`h-4 w-4 ${running ? 'animate-bounce' : ''}`} />
              {running ? 'Se salvează…' : 'Fă backup acum'}
            </button>
            {folder && (
              <button
                type="button"
                onClick={changeFolder}
                disabled={running}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                <FolderOpenIcon className="h-4 w-4" />
                Schimbă folderul
              </button>
            )}
          </div>

          {progress && (
            <div className="mt-4">
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-indigo-600 transition-all" style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {progress.current} · {progress.done} din {progress.total} înregistrări ({percent}%)
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
