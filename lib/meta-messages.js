/**
 * Mesajele paginii PI School — Messenger și Instagram, într-un singur loc.
 *
 * Se citește DOAR pagina din META_MESSAGES_PAGE_ID, ca să nu se amestece
 * conversațiile altor pagini la care ar avea acces token-ul. Fără ea, inboxul
 * rămâne neconfigurat.
 *
 * Se citesc conversații și mesaje și se poate răspunde în numele paginii,
 * în limitele impuse de Meta (fereastra de 24 de ore).
 */

const GRAPH = 'https://graph.facebook.com/v21.0'

const USER_TOKEN = process.env.META_ACCESS_TOKEN || ''

// Token de pagină, luat de-a gata. Mesageria Instagram cere capacități pe care
// le are doar un token generat pentru pagină; când e setat, îl folosim ca atare
// și nu-l mai derivăm din cel de utilizator.
const PAGE_TOKEN_ENV = process.env.META_PAGE_ACCESS_TOKEN || ''

// Pagina de care ne pasă. Un token poate administra mai multe pagini —
// aici ne uităm doar la aceasta.
export const PAGE_ID = process.env.META_MESSAGES_PAGE_ID || ''

export const isConfigured = () => !!PAGE_ID && !!(PAGE_TOKEN_ENV || USER_TOKEN)

// Un apel care nu răspunde nu trebuie să blocheze tot: fără limită, o singură
// interogare lentă spre Meta duce funcția în 504.
const CALL_TIMEOUT_MS = 20000

async function fetchWithTimeout(url, options = {}, ms = CALL_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Meta nu a răspuns în ${Math.round(ms / 1000)} secunde`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function graph(path, params = {}, token) {
  const url = new URL(`${GRAPH}/${path}`)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  url.searchParams.set('access_token', token)

  const res = await fetchWithTimeout(url, { cache: 'no-store' })
  const json = await res.json().catch(() => ({}))
  if (json.error) {
    const err = new Error(json.error.message || 'Eroare Meta API')
    err.code = json.error.code
    throw err
  }
  return json
}

// Token-ul de pagină se schimbă rar; îl ținem cât trăiește instanța.
let pageTokenCache = null

async function pageToken() {
  if (PAGE_TOKEN_ENV) return PAGE_TOKEN_ENV
  if (!USER_TOKEN) throw new Error('META_ACCESS_TOKEN lipsește')
  if (pageTokenCache) return pageTokenCache

  const res = await graph(PAGE_ID, { fields: 'access_token,name' }, USER_TOKEN)
  if (!res.access_token) {
    throw new Error('Contul Meta conectat nu are drepturi de administrare pe această pagină')
  }
  pageTokenCache = res.access_token
  return pageTokenCache
}

/** Numele paginii — ca să se vadă limpede a cui e căsuța de mesaje. */
export async function pageInfo() {
  const res = await graph(PAGE_ID, { fields: 'name,category,link' }, await pageToken())
  return { id: PAGE_ID, name: res.name, category: res.category || null, link: res.link || null }
}

const clean = (s) => (typeof s === 'string' ? s.trim() : '')

/**
 * Cine e persoana din conversație — adică oricine nu suntem noi.
 *
 * Pe Messenger, „noi" e pagina; pe Instagram, contul de Instagram al paginii.
 * Fără a-l exclude și pe acela, fiecare conversație de Instagram apărea pe
 * numele nostru.
 */
function otherParticipant(participants, platform, ourIds = []) {
  const mine = new Set([String(PAGE_ID), ...ourIds.map(String)])
  const list = participants?.data || []
  const other = list.find((p) => !mine.has(String(p.id))) || list[0] || {}
  return {
    id: other.id || null,
    name: clean(other.name) || clean(other.username) || 'Necunoscut',
    username: clean(other.username) || null,
    platform,
  }
}

/**
 * Conversațiile paginii, pentru o platformă.
 * @param {'messenger'|'instagram'} platform
 * @param {string} after cursor de paginare
 */
// Id-ul contului de Instagram legat de pagină. Unele conturi întorc
// conversațiile doar pe endpointul lor, nu pe cel al paginii.
let igAccountCache = null

async function instagramAccountId() {
  if (igAccountCache !== null) return igAccountCache
  try {
    const res = await graph(PAGE_ID, { fields: 'instagram_business_account{id}' }, await pageToken())
    igAccountCache = res.instagram_business_account?.id || null
  } catch {
    igAccountCache = null
  }
  return igAccountCache
}

// message_count și snippet sunt câmpuri de Messenger; la Instagram cerem doar
// ce e sigur suportat, altfel apelul se blochează.
// Instagram nu intoarce snippet, unread_count sau message_count — le cere
// degeaba. Textul ultimului mesaj il aducem separat, cu fetchPreviews().
const CONVERSATION_FIELDS = {
  messenger: 'id,updated_time,message_count,unread_count,snippet,participants',
  instagram: 'id,updated_time,participants',
}

export async function fetchConversations(platform = 'messenger', after = null, limit = 25) {
  const token = await pageToken()
  const fields = CONVERSATION_FIELDS[platform] || CONVERSATION_FIELDS.messenger

  let res

  res = await graph(`${PAGE_ID}/conversations`, { platform, fields, limit, after }, token)

  // Instagram: dacă pagina nu întoarce nimic, mai încercăm pe contul de
  // Instagram. Nu toate aplicațiile pot pe endpointul acela, așa că o eroare
  // de acolo nu înseamnă nimic — păstrăm ce ne-a dat pagina.
  if (platform === 'instagram' && (res.data || []).length === 0 && !after) {
    const igId = await instagramAccountId()
    if (igId) {
      try {
        const alt = await graph(`${igId}/conversations`, { platform, fields, limit }, token)
        if ((alt.data || []).length > 0) res = alt
      } catch {
        // endpointul contului nu e disponibil pentru orice aplicație
      }
    }
  }

  // Pe Instagram, contul nostru apare printre participanți ca oricare altul
  const ourIds = platform === 'instagram' ? [await instagramAccountId()].filter(Boolean) : []

  const conversations = (res.data || []).map((c) => ({
    id: c.id,
    platform,
    updatedTime: c.updated_time || null,
    messageCount: c.message_count ?? null,
    unreadCount: c.unread_count ?? 0,
    snippet: clean(c.snippet),
    person: otherParticipant(c.participants, platform, ourIds),
  }))

  return { conversations, next: res.paging?.cursors?.after && res.paging?.next ? res.paging.cursors.after : null }
}

/** Mesajele dintr-o conversație, cele mai vechi primele. */
export async function fetchMessages(conversationId, limit = 50) {
  const token = await pageToken()

  const res = await graph(`${conversationId}/messages`, {
    fields: 'id,created_time,from,to,message',
    limit,
  }, token)

  const igId = await instagramAccountId()
  const mine = new Set([String(PAGE_ID), ...(igId ? [String(igId)] : [])])

  const messages = (res.data || []).map((m) => ({
    id: m.id,
    createdTime: m.created_time || null,
    text: clean(m.message),
    fromPage: mine.has(String(m.from?.id)),
    fromName: clean(m.from?.name) || clean(m.from?.username) || '—',
  }))

  // Meta le dă de la cel mai nou; în chat le vrem cronologic
  return messages.reverse()
}

/**
 * Cifrele care contează pentru administrație: câte conversații, câte
 * necitite și cât de proaspete sunt.
 */
export function summarize(conversations) {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000

  let unread = 0
  let last24h = 0
  let last7d = 0

  for (const c of conversations) {
    if (c.unreadCount > 0) unread++
    const t = c.updatedTime ? new Date(c.updatedTime).getTime() : 0
    if (now - t <= day) last24h++
    if (now - t <= 7 * day) last7d++
  }

  return { total: conversations.length, unread, last24h, last7d }
}

// Fereastra standard de răspuns e de 24 de ore. Eticheta HUMAN_AGENT o duce
// la 7 zile — se folosește exact în cazul nostru: un om din administrație
// răspunde manual, nu un bot.
const WINDOW_ERROR = (error) => {
  const code = error?.code
  const sub = error?.error_subcode
  return code === 10 || sub === 2018278 || /outside.*window|24 hour|24-hour/i.test(error?.message || '')
}

async function postMessage(token, recipientId, text, humanAgent) {
  const payload = humanAgent
    ? { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' }
    : { messaging_type: 'RESPONSE' }

  const res = await fetchWithTimeout(`${GRAPH}/${PAGE_ID}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      ...payload,
      access_token: token,
    }),
  })

  return res.json().catch(() => ({}))
}

/**
 * Marchează conversația ca citită la Meta, ca badge-ul de necitite să nu
 * rămână agățat după ce am deschis discuția în CRM.
 */
export async function markSeen(recipientId) {
  if (!recipientId) return false
  try {
    const token = await pageToken()
    const res = await fetchWithTimeout(`${GRAPH}/${PAGE_ID}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        sender_action: 'mark_seen',
        access_token: token,
      }),
    })
    const json = await res.json().catch(() => ({}))
    return !json.error
  } catch {
    return false
  }
}

/**
 * Trimite un mesaj în numele paginii, pe Messenger sau Instagram.
 *
 * Încearcă întâi un răspuns obișnuit; dacă Meta spune că fereastra de 24 de ore
 * s-a închis, reia cu eticheta HUMAN_AGENT, care e valabilă 7 zile. Dacă și
 * asta e refuzată, spunem exact de ce — de obicei pentru că token-ului îi
 * lipsește permisiunea „human_agent".
 */
export async function sendMessage(recipientId, text) {
  if (!recipientId) throw new Error('Lipsește destinatarul')
  const body = clean(text)
  if (!body) throw new Error('Mesajul e gol')

  const token = await pageToken()

  let json = await postMessage(token, recipientId, body, false)
  let usedHumanAgent = false

  if (json.error && WINDOW_ERROR(json.error)) {
    json = await postMessage(token, recipientId, body, true)
    usedHumanAgent = true
  }

  if (json.error) {
    if (usedHumanAgent && /permission|human_agent|tag/i.test(json.error.message || '')) {
      throw new Error(
        'Meta a refuzat răspunsul ca agent uman. Token-ul curent nu are permisiunea ' +
        '„human_agent" — regenerează-l bifând-o, apoi se poate răspunde până la 7 zile ' +
        'de la ultimul mesaj al persoanei.'
      )
    }
    if (WINDOW_ERROR(json.error)) {
      throw new Error(
        'Au trecut peste 7 zile de la ultimul mesaj al persoanei — nici eticheta de agent ' +
        'uman nu mai e valabilă. Trebuie să scrie ea din nou.'
      )
    }
    throw new Error(json.error.message || 'Meta a refuzat trimiterea')
  }

  return {
    messageId: json.message_id || null,
    recipientId: json.recipient_id || recipientId,
    humanAgent: usedHumanAgent,
  }
}

/**
 * De ce nu vin conversațiile? Întreabă Meta, punct cu punct.
 *
 * Instagram are câteva condiții care, neîndeplinite, nu dau eroare — pur și
 * simplu întorc zero conversații. Aici le verificăm pe rând, ca să se vadă
 * exact unde se rupe lanțul.
 */
export async function diagnose() {
  const out = { page: null, instagram: null, subscribedApps: null, platforms: {} }

  // Token-ul de pagină e nevoie pentru restul verificărilor — o singură dată
  let token = null
  let tokenError = null
  try {
    token = await pageToken()
  } catch (e) {
    tokenError = e.message
  }

  // Toate verificările deodată: în serie ar fi durat cât suma lor
  const [pageRes, subsRes, messengerRes, instagramRes] = await Promise.allSettled([
    graph(PAGE_ID, { fields: 'name,instagram_business_account{id,username,name}' }, token || USER_TOKEN),
    token
      ? graph(`${PAGE_ID}/subscribed_apps`, { fields: 'subscribed_fields' }, token)
      : Promise.reject(new Error(tokenError || 'Fără token de pagină')),
    fetchConversations('messenger', null, 3),
    fetchConversations('instagram', null, 3),
  ])

  if (pageRes.status === 'fulfilled') {
    const page = pageRes.value
    out.page = { id: PAGE_ID, name: page.name }
    out.instagram = page.instagram_business_account
      ? {
          id: page.instagram_business_account.id,
          username: page.instagram_business_account.username,
          name: page.instagram_business_account.name || null,
        }
      : null
  } else {
    out.page = { id: PAGE_ID, error: pageRes.reason?.message || 'Eroare' }
  }

  if (subsRes.status === 'fulfilled') {
    const apps = subsRes.value.data || []
    const fields = apps.flatMap((a) => a.subscribed_fields || [])
    out.subscribedApps = { count: apps.length, fields, hasMessages: fields.includes('messages') }
  } else {
    out.subscribedApps = { error: subsRes.reason?.message || 'Eroare' }
  }

  for (const [platform, res] of [['messenger', messengerRes], ['instagram', instagramRes]]) {
    out.platforms[platform] = res.status === 'fulfilled'
      ? { ok: true, count: res.value.conversations.length }
      : { ok: false, error: res.reason?.message || 'Eroare', code: res.reason?.code || null }
  }

  return out
}

/**
 * Abonează aplicația la mesajele paginii — pasul care lipsește de obicei
 * pentru Instagram. E o singură setare pe pagină, reversibilă din Meta.
 */
export async function subscribePageMessaging() {
  const token = await pageToken()

  const res = await fetchWithTimeout(`${GRAPH}/${PAGE_ID}/subscribed_apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscribed_fields: 'messages,messaging_postbacks,message_reactions',
      access_token: token,
    }),
  })

  const json = await res.json().catch(() => ({}))
  if (json.error) throw new Error(json.error.message || 'Abonarea a eșuat')
  return { success: !!json.success }
}

/**
 * Linkul care deschide conversația direct în inboxul paginii, în Meta Business
 * Suite — acolo se răspunde ca pagină, nu de pe contul personal.
 */
export function inboxLink(personId, platform = 'messenger', conversationId = null) {
  // Inboxul Meta selectează discuția după id-ul firului, nu al persoanei.
  // Id-ul nostru vine ca „t_1380851516835207"; acolo se folosește fără „t_".
  const threadId = conversationId ? String(conversationId).replace(/^t_/, '') : null
  const selected = threadId || personId
  if (!selected) return null

  const folder = platform === 'instagram' ? 'instagram' : 'all'
  const threadType = platform === 'instagram' ? 'IG_MESSAGE' : 'FB_MESSAGE'

  const params = new URLSearchParams({
    asset_id: PAGE_ID,
    selected_item_id: String(selected),
    thread_type: threadType,
  })

  return `https://business.facebook.com/latest/inbox/${folder}?${params.toString()}`
}

/**
 * Inboxul: Messenger și Instagram într-o singură listă, ordonată după cât de
 * proaspătă e discuția.
 *
 * Cele două platforme se cer în paralel — în serie însemna dublul așteptării,
 * iar Meta răspunde oricum în câteva secunde bune.
 */
export async function fetchInbox(limit = 25) {
  const [messenger, instagram] = await Promise.allSettled([
    fetchConversations('messenger', null, limit),
    fetchConversations('instagram', null, limit),
  ])

  const conversations = []
  const errors = []

  for (const [platform, res] of [['messenger', messenger], ['instagram', instagram]]) {
    if (res.status === 'fulfilled') conversations.push(...res.value.conversations)
    else errors.push(`${platform}: ${res.reason?.message || 'eroare'}`)
  }

  conversations.sort(
    (a, b) => new Date(b.updatedTime || 0) - new Date(a.updatedTime || 0)
  )

  // Instagram nu dă textul ultimului mesaj; îl completăm noi
  const withPreviews = await fetchPreviews(conversations).catch(() => conversations)

  return { conversations: withPreviews, errors }
}

/**
 * Textul ultimului mesaj, pentru conversațiile care nu-l primesc de la Meta
 * (adică toate cele de Instagram).
 *
 * Se cer în paralel, câte una pe conversație — sunt cereri mici, iar rezultatul
 * ajunge oricum în cache, deci prețul se plătește o dată, în fundal.
 */
export async function fetchPreviews(conversations, max = 15) {
  const token = await pageToken()
  const igId = await instagramAccountId()
  const mine = new Set([String(PAGE_ID), ...(igId ? [String(igId)] : [])])

  const target = conversations.filter((c) => !c.snippet).slice(0, max)
  if (target.length === 0) return conversations

  const previews = await Promise.allSettled(
    target.map((c) =>
      graph(`${c.id}/messages`, { fields: 'message,from,created_time', limit: 1 }, token)
    )
  )

  const byId = new Map()
  target.forEach((c, i) => {
    const res = previews[i]
    if (res.status !== 'fulfilled') return
    const last = res.value.data?.[0]
    if (!last) return

    byId.set(c.id, {
      snippet: clean(last.message),
      lastFromPage: mine.has(String(last.from?.id)),
      lastMessageAt: last.created_time || null,
    })
  })

  return conversations.map((c) => (byId.has(c.id) ? { ...c, ...byId.get(c.id) } : c))
}
