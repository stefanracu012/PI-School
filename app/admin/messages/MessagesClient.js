'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { usePermissions } from '@/hooks/usePermissions'
import {
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  EnvelopeOpenIcon,
  InboxIcon,
  ClockIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline'
import { PlatformIcon } from '@/components/icons/BrandIcons'
import ConversationLeadControl from '@/components/admin/ConversationLeadControl'
import { getStatus } from '@/lib/leads-config'

/**
 * Inboxul paginii: Messenger și Instagram într-o singură listă.
 *
 * Nu există buton de actualizare — lista se împrospătează singură, în fundal,
 * și la fiecare revenire în fereastră. Datele vechi rămân pe ecran cât timp
 * vin cele noi, ca să nu clipească pagina.
 */

const TABS = [
  { value: 'unread', label: 'Necitite', icon: EnvelopeOpenIcon },
  { value: 'all', label: 'Toate', icon: InboxIcon },
  { value: 'recent', label: 'Recente', icon: ClockIcon },
]

const POLL_MS = 25000
const STORE_KEY = 'pischool:inbox'
const STORE_MAX_AGE = 10 * 60 * 1000

/** Ultimul inbox văzut, ca pagina să apară desenată înainte de răspuns. */
const readStored = () => {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    if (!raw) return null
    const { at, data } = JSON.parse(raw)
    return Date.now() - at < STORE_MAX_AGE ? data : null
  } catch {
    return null
  }
}

const THREADS_KEY = 'pischool:threads'

const readStoredThreads = () => {
  try {
    const raw = sessionStorage.getItem(THREADS_KEY)
    if (!raw) return {}
    const { at, threads } = JSON.parse(raw)
    return Date.now() - at < STORE_MAX_AGE ? threads : {}
  } catch {
    return {}
  }
}

const writeStoredThreads = (threads) => {
  try {
    sessionStorage.setItem(THREADS_KEY, JSON.stringify({ at: Date.now(), threads }))
  } catch {
    // sessionStorage plin — firele se vor reciti de la server
  }
}

const writeStored = (data) => {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({ at: Date.now(), data }))
  } catch {
    // sessionStorage plin sau blocat — nu e nimic esențial aici
  }
}

const timeLabel = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const min = Math.round((Date.now() - d.getTime()) / 60000)
  if (min < 1) return 'acum'
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  if (h < 24) {
    return d.toLocaleTimeString('ro-RO', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Chisinau',
    })
  }
  return d.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', timeZone: 'Europe/Chisinau' })
}

const fullTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('ro-RO', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Chisinau',
      })
    : ''

const initials = (name) =>
  String(name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

/** Cerc cu inițiale și sigla platformei, ca în inboxul Meta. */
function Avatar({ name, platform, id }) {
  const isIg = platform === 'instagram'
  return (
    <div className="relative flex-shrink-0">
      <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold ${
        isIg ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'
      }`}>
        {initials(name)}
      </div>
      <span
        className="absolute -bottom-0.5 -right-0.5 h-[18px] w-[18px] rounded-full bg-white ring-2 ring-white flex items-center justify-center"
        title={isIg ? 'Instagram' : 'Messenger'}
      >
        <PlatformIcon platform={platform} className="h-[15px] w-[15px]" id={id} />
      </span>
    </div>
  )
}

export default function MessagesClient() {
  const router = useRouter()
  const { hasPermission, isSuperAdmin } = usePermissions()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [tab, setTab] = useState('unread')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [threads, setThreads] = useState({})   // conversationId → mesaje
  const [threadLoading, setThreadLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const [check, setCheck] = useState(null)
  const [checking, setChecking] = useState(false)

  const bottomRef = useRef(null)
  // Ținem minte dacă avem deja ceva pe ecran, fără ca load() să depindă de date
  // (altfel intervalul de împrospătare s-ar reporni la fiecare clic)
  const hasDataRef = useRef(false)
  const canSend = hasPermission('messages.send') || isSuperAdmin
  // Statusul se schimbă din conversație doar de cine are voie să lucreze lead-urile
  const canEditLeads = hasPermission('leads.edit') || isSuperAdmin

  useEffect(() => {
    if (!hasPermission('messages.view') && !isSuperAdmin) router.push('/admin')
  }, [hasPermission, isSuperAdmin, router])

  // Desenăm imediat ce știam, apoi înlocuim cu ce vine de la server
  useEffect(() => {
    const stored = readStored()
    if (stored) {
      setData(stored)
      hasDataRef.current = true
      setLoading(false)
    }
    const storedThreads = readStoredThreads()
    if (Object.keys(storedThreads).length > 0) setThreads(storedThreads)
  }, [])

  // ── Lista, împrospătată singură ──────────────────────────────────────
  const load = useCallback(async ({ silent = false } = {}) => {
    // Ecranul de încărcare doar dacă n-avem chiar nimic de arătat
    if (!silent && !hasDataRef.current) setLoading(true)
    try {
      const res = await fetch('/api/admin/messages')
      const json = await res.json()
      if (!res.ok) throw new Error(json.hint || json.error || 'Eroare la citirea mesajelor')
      setData(json)
      hasDataRef.current = true
      writeStored(json)
      setError(null)
    } catch (err) {
      // La o reîmprospătare tăcută păstrăm ce era pe ecran
      if (!silent) setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const timer = setInterval(() => load({ silent: true }), POLL_MS)
    const onFocus = () => load({ silent: true })
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [load])

  // Venind dintr-un lead, deschidem direct conversația lui
  useEffect(() => {
    if (typeof window === 'undefined' || loading) return
    const params = new URLSearchParams(window.location.search)
    const conversationId = params.get('conversation')
    if (!conversationId) return

    openThread({
      id: conversationId,
      platform: params.get('platform') === 'instagram' ? 'instagram' : 'messenger',
      person: { id: params.get('person') || null, name: params.get('name') || 'Conversație' },
      updatedTime: null,
      unreadCount: 0,
      snippet: '',
    })
    window.history.replaceState({}, '', '/admin/messages')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // ── Un fir de discuție ───────────────────────────────────────────────
  const openThread = async (conversation) => {
    setSelected({ ...conversation, unreadCount: 0 })
    setDraft('')

    // Badge-ul se stinge pe loc, fără să așteptăm serverul
    setData((prev) => prev && ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.id === conversation.id ? { ...c, unreadCount: 0 } : c
      ),
      stats: prev.stats && {
        ...prev.stats,
        unread: Math.max(0, (prev.stats.unread || 0) - (conversation.unreadCount > 0 ? 1 : 0)),
      },
    }))

    // Dacă am mai deschis firul, îl arătăm din memorie și îl împrospătăm apoi
    const known = threads[conversation.id]
    setThreadLoading(!known)

    try {
      const res = await fetch(
        `/api/admin/messages?conversation=${encodeURIComponent(conversation.id)}` +
        (conversation.person?.id ? `&person=${encodeURIComponent(conversation.person.id)}` : '')
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eroare la citirea conversației')
      setThreads((prev) => {
        const next = { ...prev, [conversation.id]: json.messages || [] }
        writeStoredThreads(next)
        return next
      })
    } catch (err) {
      if (!known) toast.error(err.message)
    } finally {
      setThreadLoading(false)
    }
  }

  const thread = selected ? threads[selected.id] || [] : []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [thread.length, selected?.id])

  // 24h pentru un răspuns obișnuit, 7 zile cu eticheta de agent uman
  const lastFromPerson = [...thread].reverse().find((m) => !m.fromPage)
  const sinceLast = lastFromPerson ? Date.now() - new Date(lastFromPerson.createdTime).getTime() : null
  const HOUR = 60 * 60 * 1000
  const asHumanAgent = sinceLast != null && sinceLast > 24 * HOUR && sinceLast <= 7 * 24 * HOUR
  const windowClosed = sinceLast != null ? sinceLast > 7 * 24 * HOUR : thread.length > 0

  const send = async (e) => {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || !selected?.person?.id) return

    setSending(true)
    try {
      const res = await fetch('/api/admin/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: selected.person.id,
          text,
          conversationId: selected.id,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Mesajul nu a putut fi trimis')

      setThreads((prev) => ({
        ...prev,
        [selected.id]: [...(prev[selected.id] || []), {
          id: json.messageId || `local-${Date.now()}`,
          createdTime: json.sentAt,
          text,
          fromPage: true,
          fromName: 'noi',
        }],
      }))
      setDraft('')
      setData((prev) => prev && ({
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === selected.id ? { ...c, snippet: text, updatedTime: json.sentAt } : c
        ),
      }))
      if (json.humanAgent) toast.success('Trimis ca răspuns de agent uman')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSending(false)
    }
  }

  // Lead-ul s-a schimbat din conversație: îl actualizăm peste tot pe ecran
  const updateLead = (conversationId, lead) => {
    setSelected((prev) => (prev?.id === conversationId ? { ...prev, lead } : prev))
    setData((prev) => {
      if (!prev) return prev
      const next = {
        ...prev,
        conversations: prev.conversations.map((c) => (c.id === conversationId ? { ...c, lead } : c)),
      }
      writeStored(next)
      return next
    })
  }

  // ── Filtrare ─────────────────────────────────────────────────────────
  const conversations = useMemo(() => {
    let list = data?.conversations || []

    if (tab === 'unread') list = list.filter((c) => c.unreadCount > 0)
    else if (tab === 'recent') {
      const day = 24 * 60 * 60 * 1000
      list = list.filter((c) => Date.now() - new Date(c.updatedTime || 0).getTime() <= day)
    }

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((c) =>
        c.person.name.toLowerCase().includes(q) ||
        (c.person.username || '').toLowerCase().includes(q) ||
        (c.snippet || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [data, tab, search])

  const unreadCount = data?.stats?.unread || 0

  const runCheck = async () => {
    setChecking(true)
    try {
      const res = await fetch('/api/admin/messages?diagnose=1')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eroare')
      setCheck(json)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setChecking(false)
    }
  }

  const subscribePage = async () => {
    setChecking(true)
    try {
      const res = await fetch('/api/admin/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eroare')
      toast.success('Aplicația a fost abonată la mesajele paginii')
      await runCheck()
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Antet */}
      <div>
        <h1 className="text-xl xs:text-2xl font-bold text-gray-900">Mesaje</h1>
        <p className="text-sm text-gray-600">
          {data?.page?.name ? `Messenger și Instagram · ${data.page.name}` : 'Messenger și Instagram'}
          {data?.stats?.unread > 0 && (
            <span className="ml-2 text-indigo-600 font-medium">
              {data.stats.unread} {data.stats.unread === 1 ? 'necitit' : 'necitite'}
            </span>
          )}
        </p>
      </div>

{/* Cu date pe ecran, o eroare de moment e o notă, nu un zid roșu */}
      {error && (
        data ? (
          <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <ExclamationTriangleIcon className="h-3.5 w-3.5 flex-shrink-0" />
            Meta răspunde greu — vezi ultimele date cunoscute. Se reîncearcă singur.
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Nu s-au putut citi mesajele</p>
              <p className="text-sm text-red-700 mt-0.5">{error}</p>
            </div>
          </div>
        )
      )}

      {data?.errors?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          {data.errors.join(' · ')}
        </div>
      )}

      {/* Pe ecran mic nu încap două coloane una sub alta: ori inboxul, ori
          conversația deschisă — exact ca în aplicația Meta. */}
      <div className="grid lg:grid-cols-[23rem_1fr] gap-3 items-start">
        {/* Lista */}
        <div
          className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${
            selected ? 'hidden lg:block' : ''
          }`}
        >
          <div className="px-3 pt-3">
            <h2 className="text-sm font-bold text-gray-900 mb-2">Inbox</h2>

            <div className="flex items-center gap-1 border-b border-gray-100">
              {TABS.map((t) => {
                const Icon = t.icon
                const active = tab === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTab(t.value)}
                    className={`relative flex flex-1 lg:flex-none items-center justify-center lg:justify-start gap-1.5 px-2 lg:px-2.5 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                      active
                        ? 'border-indigo-600 text-indigo-700'
                        : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                    {t.value === 'unread' && unreadCount > 0 && (
                      <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-semibold">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="relative my-2">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Caută după nume sau text…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {loading && !data ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="h-9 w-9 rounded-full bg-gray-100" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                    <div className="h-2.5 bg-gray-100 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-5 text-sm text-gray-500 text-center space-y-3">
              <p>
                {search
                  ? 'Nicio conversație care să se potrivească.'
                  : tab === 'unread'
                    ? 'Nicio conversație necitită. 🎉'
                    : 'Nicio conversație încă.'}
              </p>

              {!search && tab !== 'unread' && (
                <div className="text-left space-y-2">
                  <button
                    type="button"
                    onClick={runCheck}
                    disabled={checking}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {checking ? 'Se verifică…' : '🔎 Verifică conexiunea cu Meta'}
                  </button>

                  {check && (
                    <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1.5 text-gray-700">
                      <p><b>Pagina:</b> {check.page?.name || check.page?.error || '—'}</p>
                      <p><b>Instagram:</b> {check.instagram ? `@${check.instagram.username}` : 'niciun cont legat'}</p>
                      <p><b>Abonat la mesaje:</b> {check.subscribedApps?.hasMessages ? 'da' : 'nu'}</p>
                      <p>
                        <b>Conversații:</b> Messenger{' '}
                        {check.platforms?.messenger?.ok ? check.platforms.messenger.count : 'eroare'}
                        {' · '}Instagram{' '}
                        {check.platforms?.instagram?.ok ? check.platforms.instagram.count : 'eroare'}
                      </p>
                      {check.subscribedApps && !check.subscribedApps.hasMessages && (
                        <button
                          type="button"
                          onClick={subscribePage}
                          disabled={checking}
                          className="mt-1 w-full px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-60"
                        >
                          Abonează aplicația la mesajele paginii
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-[calc(100vh-17rem)] lg:max-h-[68vh] overflow-y-auto">
              {conversations.map((c) => {
                const active = selected?.id === c.id
                const unread = c.unreadCount > 0
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => openThread(c)}
                      className={`w-full text-left px-3 py-2.5 flex gap-3 transition-colors ${
                        active ? 'bg-indigo-50' : unread ? 'bg-blue-50/40 hover:bg-gray-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <Avatar name={c.person.name} platform={c.platform} id={`av-${c.id}`} />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm truncate ${unread ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
                            {c.person.name}
                            {c.lead && (
                              <span
                                className={`ml-1.5 align-middle px-1.5 py-0.5 rounded border text-[9px] font-medium ${getStatus(c.lead.status).color}`}
                              >
                                {getStatus(c.lead.status).label}
                              </span>
                            )}
                          </span>
                          <span className={`text-[11px] whitespace-nowrap ${unread ? 'text-indigo-600 font-medium' : 'text-gray-400'}`}>
                            {timeLabel(c.updatedTime)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          {/* La Instagram numele e chiar username-ul — nu-l repetăm dedesubt */}
                          <p className={`text-xs truncate ${unread ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                            {c.lastFromPage && c.snippet && (
                              <span className="text-gray-400">Tu: </span>
                            )}
                            {c.snippet || <span className="text-gray-300">fără text</span>}
                          </p>
                          {unread && (
                            <span className="flex-shrink-0 px-1.5 h-[18px] rounded-full bg-indigo-600 text-white text-[10px] font-semibold flex items-center justify-center">
                              Nou
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Firul */}
        <div
          className={`bg-white rounded-xl border border-gray-200 min-h-[26rem] flex-col ${
            selected ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10 text-gray-500">
              <ChatBubbleLeftRightIcon className="h-10 w-10 text-gray-300 mb-2" />
              <p className="text-sm">Alege o conversație din stânga.</p>
            </div>
          ) : (
            <>
              <div className="px-3 lg:px-4 py-2.5 lg:py-3 border-b border-gray-100 flex flex-wrap items-center gap-2 lg:gap-3 sticky top-0 bg-white z-10 rounded-t-xl">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="lg:hidden -ml-1 p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                  aria-label="Înapoi la inbox"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </button>
                <Avatar name={selected.person.name} platform={selected.platform} id="av-open" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 truncate">{selected.person.name}</p>
                  <p className="text-xs text-gray-500">
                    {selected.platform === 'instagram' ? 'Instagram' : 'Messenger'}
                    {selected.person.username ? ` · @${selected.person.username}` : ''}
                    {selected.updatedTime ? ` · ${fullTime(selected.updatedTime)}` : ''}
                  </p>
                </div>

                {canEditLeads && (
                  <ConversationLeadControl
                    conversation={selected}
                    onChange={(lead) => updateLead(selected.id, lead)}
                  />
                )}
              </div>

              {threadLoading ? (
                <div className="flex-1 flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                </div>
              ) : thread.length === 0 ? (
                <p className="flex-1 p-6 text-sm text-gray-500 text-center">Fără mesaje de afișat.</p>
              ) : (
                <div className="flex-1 p-3 lg:p-4 space-y-2 max-h-[calc(100vh-22rem)] min-h-[45vh] lg:max-h-[56vh] lg:min-h-0 overflow-y-auto">
                  {thread.map((m) => (
                    <div key={m.id} className={`flex ${m.fromPage ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] lg:max-w-[80%] rounded-2xl px-3 py-2 ${
                        m.fromPage
                          ? 'bg-indigo-600 text-white rounded-br-sm'
                          : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                      }`}>
                        {m.text ? (
                          <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>
                        ) : (
                          <p className="text-sm italic opacity-70">(atașament)</p>
                        )}
                        <p className={`text-[10px] mt-0.5 ${m.fromPage ? 'text-indigo-100' : 'text-gray-400'}`}>
                          {fullTime(m.createdTime)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
              )}

              {canSend ? (
                <form onSubmit={send} className="border-t border-gray-100 p-2.5 lg:p-3 space-y-2 sticky bottom-0 bg-white rounded-b-xl">
                  {windowClosed ? (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                      Peste 7 zile de la ultimul mesaj al persoanei — Meta nu mai permite niciun răspuns.
                    </p>
                  ) : asHumanAgent ? (
                    <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1.5">
                      Peste 24 de ore: mesajul pleacă marcat ca răspuns de agent uman (permis 7 zile).
                    </p>
                  ) : null}

                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
                      }}
                      rows={2}
                      placeholder="Scrie un mesaj… (Enter trimite)"
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                    />
                    <button
                      type="submit"
                      disabled={sending || !draft.trim()}
                      className="inline-flex items-center gap-1.5 px-3 xs:px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    >
                      <PaperAirplaneIcon className="h-4 w-4" />
                      <span className="hidden xs:inline">{sending ? '…' : 'Trimite'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <p className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-500">
                  Nu ai permisiunea de a răspunde.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
