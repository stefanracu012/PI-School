/**
 * Meta (Facebook/Instagram) Marketing API — tot ce ține de reclame.
 *
 * Token-ul stă în variabila de mediu META_ACCESS_TOKEN, niciodată în cod.
 * Opțional, META_AD_ACCOUNT_IDS limitează conturile afișate (separate prin
 * virgulă, cu sau fără prefixul „act_").
 *
 * META_PAGE_IDS ține pagina de care ne pasă (ex. PI School): când e setat,
 * se păstrează DOAR campaniile care promovează acea pagină, iar totalurile și
 * lunile se recalculează din ele. Așa nu se amestecă brandurile din același
 * token.
 *
 * Toate apelurile sunt READ-ONLY: nu se creează și nu se modifică nimic în
 * contul de reclame.
 */

const GRAPH = 'https://graph.facebook.com/v21.0'

const TOKEN = process.env.META_ACCESS_TOKEN || ''

const idList = (raw) =>
  (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const ACCOUNT_FILTER = idList(process.env.META_AD_ACCOUNT_IDS).map((id) =>
  id.startsWith('act_') ? id : `act_${id}`
)
// META_PAGE_IDS păstrează doar reclamele paginii PI School; fără el (sau cu
// „all") se arată toate campaniile din conturile la care are acces token-ul.
const rawPageFilter = idList(process.env.META_PAGE_IDS)
const PAGE_FILTER = rawPageFilter.includes('all') ? [] : rawPageFilter

export const isConfigured = () => !!TOKEN

class MetaError extends Error {
  constructor(message, { status, code, type } = {}) {
    super(message)
    this.status = status
    this.code = code
    this.type = type
  }
}

async function graph(path, params = {}, token = TOKEN) {
  if (!token) throw new MetaError('META_ACCESS_TOKEN lipsește')

  const url = new URL(`${GRAPH}/${path}`)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  }
  url.searchParams.set('access_token', token)

  const res = await fetch(url, { cache: 'no-store' })
  const json = await res.json().catch(() => ({}))

  if (json.error) {
    throw new MetaError(json.error.message || 'Eroare Meta API', {
      status: res.status,
      code: json.error.code,
      type: json.error.type,
    })
  }
  return json
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613])

/** Ce înseamnă eroarea pentru om, cu mesajul original al Meta la coadă. */
export function explainMetaError(e) {
  const code = Number(e?.code)
  const original = e?.message ? ` (Meta: ${e.message})` : ''
  if (code === 190 || code === 102) {
    return 'Token-ul Meta a expirat sau nu mai e valid. Generează unul nou — cel mai bine de ' +
      '„system user" din Business Manager, care nu expiră — și pune-l în META_ACCESS_TOKEN pe Vercel.' + original
  }
  if (RATE_LIMIT_CODES.has(code) || (code >= 80000 && code <= 80014)) {
    return 'Meta a limitat temporar cererile (prea multe într-un timp scurt). Trece singur, ' +
      'de obicei în mai puțin de o oră.' + original
  }
  if (code === 10 || (code >= 200 && code < 300)) {
    return 'Token-ul Meta nu are dreptul să citească reclamele (ads_read).' + original
  }
  return e?.message || 'Eroare Meta API'
}

/** Parcurge toate paginile unui edge, cu o limită de siguranță. */
async function graphAll(path, params = {}, { maxPages = 10, token = TOKEN } = {}) {
  const out = []
  let after = null
  for (let i = 0; i < maxPages; i++) {
    const page = await graph(path, { ...params, limit: params.limit || 100, after }, token)
    out.push(...(page.data || []))
    after = page.paging?.cursors?.after
    if (!after || !page.paging?.next) break
  }
  return out
}

// ── Ajutoare pentru cifre ────────────────────────────────────────────────

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Din lista „actions" scoate primul tip disponibil, în ordinea dată.
 * Meta raportează același rezultat sub mai multe nume (ex. un lead apare și ca
 * „lead", și ca „onsite_conversion.lead", și ca „onsite_web_lead"), așa că
 * adunarea lor ar tripla cifrele.
 */
const pickAction = (actions, types) => {
  if (!Array.isArray(actions)) return 0
  for (const type of types) {
    const hit = actions.find((a) => a.action_type === type)
    if (hit) return num(hit.value)
  }
  return 0
}

const LEAD_ACTIONS = [
  'lead',
  'onsite_conversion.lead_grouped',
  'onsite_conversion.lead',
  'onsite_web_lead',
  'offsite_conversion.fb_pixel_lead',
]
const MESSAGE_ACTIONS = [
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection',
  'onsite_conversion.messaging_first_reply',
]
const REPLY_ACTIONS = ['onsite_conversion.messaging_conversation_replied_7d']
const PURCHASE_ACTIONS = ['omni_purchase', 'onsite_conversion.purchase', 'purchase']

/** Normalizează un rând de insights la cifrele care ne interesează. */
function shapeInsights(row = {}) {
  const spend = num(row.spend)
  const leads = pickAction(row.actions, LEAD_ACTIONS)
  const messages = pickAction(row.actions, MESSAGE_ACTIONS)
  const linkClicks = pickAction(row.actions, ['link_click'])

  return {
    spend,
    impressions: num(row.impressions),
    reach: num(row.reach),
    clicks: num(row.clicks),
    linkClicks,
    ctr: num(row.ctr),
    cpc: num(row.cpc),
    cpm: num(row.cpm),
    leads,
    messages,
    replies: pickAction(row.actions, REPLY_ACTIONS),
    purchases: pickAction(row.actions, PURCHASE_ACTIONS),
    videoViews: pickAction(row.actions, ['video_view']),
    postEngagement: pickAction(row.actions, ['post_engagement']),
    costPerLead: leads > 0 ? spend / leads : null,
    costPerMessage: messages > 0 ? spend / messages : null,
    dateStart: row.date_start || null,
    dateStop: row.date_stop || null,
  }
}

const INSIGHT_FIELDS = 'spend,impressions,reach,clicks,ctr,cpc,cpm,actions,date_start,date_stop'

// Meta refuză insights mai vechi de 37 de luni („#3018"), oricât de vechi ar
// fi contul. Cerem, deci, cea mai lungă fereastră permisă — dar nu mai devreme
// decât data la care s-a creat contul.
const MAX_MONTHS_BACK = 36
const today = () => new Date().toISOString().slice(0, 10)

function windowStart(createdTime) {
  const limit = new Date()
  limit.setMonth(limit.getMonth() - MAX_MONTHS_BACK)
  limit.setDate(1)

  const created = createdTime ? new Date(createdTime) : null
  const start = created && created > limit ? created : limit
  return start.toISOString().slice(0, 10)
}

// ── Datele propriu-zise ──────────────────────────────────────────────────

async function accountInsights(accountId, since) {
  const res = await graph(`${accountId}/insights`, {
    fields: INSIGHT_FIELDS,
    time_range: JSON.stringify({ since, until: today() }),
  })
  return shapeInsights(res.data?.[0] || {})
}

async function accountMonthly(accountId, since) {
  const rows = await graphAll(`${accountId}/insights`, {
    fields: INSIGHT_FIELDS,
    time_range: JSON.stringify({ since, until: today() }),
    time_increment: 'monthly',
  }, { maxPages: 4 })

  return rows
    .map((r) => ({ ...shapeInsights(r), month: (r.date_start || '').slice(0, 7) }))
    .sort((a, b) => b.month.localeCompare(a.month))
}

async function accountCampaigns(accountId, since, { filtering, warn }) {
  const [campaigns, adsets] = await Promise.all([
    graphAll(`${accountId}/campaigns`, {
      fields: 'name,status,objective,created_time,start_time,stop_time,daily_budget,lifetime_budget',
    }, { maxPages: 5 }),
    // Fără adsets nu se știe ce pagină promovează campaniile — cu filtru pe
    // pagină, contul ar părea gol, deci eroarea trebuie să urce
    graphAll(`${accountId}/adsets`, {
      fields: 'campaign_id,promoted_object',
    }, { maxPages: 5 }).catch((e) => {
      if (filtering) throw e
      warn(e)
      return []
    }),
  ])

  // Ce pagină promovează fiecare campanie — de aici știm al cui e brandul
  const pagesByCampaign = new Map()
  for (const a of adsets) {
    const page = a.promoted_object?.page_id
    if (!page || !a.campaign_id) continue
    const set = pagesByCampaign.get(a.campaign_id) || new Set()
    set.add(String(page))
    pagesByCampaign.set(a.campaign_id, set)
  }

  if (campaigns.length === 0) return []

  // Insights pentru toate campaniile, dintr-un singur apel
  const rows = await graphAll(`${accountId}/insights`, {
    fields: `campaign_id,campaign_name,${INSIGHT_FIELDS}`,
    level: 'campaign',
    time_range: JSON.stringify({ since, until: today() }),
  }, { maxPages: 5 })

  // Lună de lună, tot la nivel de campanie: la filtrare pe pagină, doar așa
  // se pot reface corect totalurile lunare.
  const monthlyRows = await graphAll(`${accountId}/insights`, {
    fields: `campaign_id,${INSIGHT_FIELDS}`,
    level: 'campaign',
    time_range: JSON.stringify({ since, until: today() }),
    time_increment: 'monthly',
  }, { maxPages: 8 }).catch((e) => { warn(e); return [] })

  const statsById = new Map(rows.map((r) => [r.campaign_id, shapeInsights(r)]))

  const monthlyById = new Map()
  for (const r of monthlyRows) {
    const list = monthlyById.get(r.campaign_id) || []
    list.push({ ...shapeInsights(r), month: (r.date_start || '').slice(0, 7) })
    monthlyById.set(r.campaign_id, list)
  }

  return campaigns
    .map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      createdTime: c.created_time || null,
      startTime: c.start_time || null,
      stopTime: c.stop_time || null,
      dailyBudget: c.daily_budget ? num(c.daily_budget) / 100 : null,
      lifetimeBudget: c.lifetime_budget ? num(c.lifetime_budget) / 100 : null,
      pageIds: [...(pagesByCampaign.get(c.id) || [])],
      stats: statsById.get(c.id) || shapeInsights({}),
      monthly: monthlyById.get(c.id) || [],
    }))
    .sort((a, b) => b.stats.spend - a.stats.spend)
}

/** Adună mai multe rânduri de insights într-unul singur, corect. */
function sumInsights(list) {
  const total = list.reduce((acc, s) => ({
    spend: acc.spend + s.spend,
    impressions: acc.impressions + s.impressions,
    reach: acc.reach + s.reach,
    clicks: acc.clicks + s.clicks,
    linkClicks: acc.linkClicks + s.linkClicks,
    leads: acc.leads + s.leads,
    messages: acc.messages + s.messages,
    replies: acc.replies + s.replies,
    purchases: acc.purchases + s.purchases,
    videoViews: acc.videoViews + s.videoViews,
    postEngagement: acc.postEngagement + s.postEngagement,
  }), {
    spend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, leads: 0,
    messages: 0, replies: 0, purchases: 0, videoViews: 0, postEngagement: 0,
  })

  // Ratele nu se adună — se recalculează
  total.ctr = total.impressions > 0 ? (total.clicks / total.impressions) * 100 : 0
  total.cpc = total.clicks > 0 ? total.spend / total.clicks : 0
  total.cpm = total.impressions > 0 ? (total.spend / total.impressions) * 1000 : 0
  total.costPerLead = total.leads > 0 ? total.spend / total.leads : null
  total.costPerMessage = total.messages > 0 ? total.spend / total.messages : null
  return total
}

/**
 * Un cont complet: identitate + totaluri + campanii + lunile.
 * Dacă nu se pot citi campaniile, aruncă; bucățile secundare care lipsesc
 * ajung la `warn`, nu dispar în tăcere.
 */
async function loadAccount(account, warn) {
  const since = windowStart(account.created_time)

  // Cu filtru pe pagină păstrăm doar campaniile paginii, iar totalurile și
  // lunile se refac din ele — altfel ar rămâne cifrele întregului cont. Așa că
  // pe cele ale contului nici nu le mai cerem: fiecare cerere contează la
  // limita Meta.
  const filtering = PAGE_FILTER.length > 0
  const [allCampaigns, accountTotals, accountMonths] = await Promise.all([
    accountCampaigns(account.id, since, { filtering, warn }),
    filtering ? null : accountInsights(account.id, since).catch((e) => { warn(e); return shapeInsights({}) }),
    filtering ? null : accountMonthly(account.id, since).catch((e) => { warn(e); return [] }),
  ])

  const campaigns = filtering
    ? allCampaigns.filter((c) => c.pageIds.some((id) => PAGE_FILTER.includes(id)))
    : allCampaigns

  let totals = accountTotals
  let monthly = accountMonths

  if (filtering) {
    totals = sumInsights(campaigns.map((c) => c.stats))

    const byMonth = new Map()
    for (const c of campaigns) {
      for (const m of c.monthly) {
        if (!m.month) continue
        const list = byMonth.get(m.month) || []
        list.push(m)
        byMonth.set(m.month, list)
      }
    }
    monthly = [...byMonth.entries()]
      .map(([month, list]) => ({ ...sumInsights(list), month }))
      .sort((a, b) => b.month.localeCompare(a.month))
  }

  return {
    id: account.id,
    accountId: account.account_id,
    name: account.name,
    currency: account.currency,
    status: account.account_status,
    createdTime: account.created_time || null,
    windowSince: since,
    // amount_spent vine în subunități (cenți)
    amountSpentAllTime: num(account.amount_spent) / 100,
    promotedPageIds: account.promotedPageIds || [],
    totals,
    campaigns: campaigns.map(({ monthly: _m, ...c }) => c),
    monthly,
  }
}

/**
 * Ce pagini promovează contul — așa se vede cui aparțin reclamele.
 * null = nu s-a putut afla (alt răspuns decât o listă goală).
 */
async function promotedPages(accountId) {
  try {
    const adsets = await graphAll(`${accountId}/adsets`, {
      fields: 'promoted_object',
    }, { maxPages: 3 })
    const ids = new Set()
    for (const a of adsets) {
      const p = a.promoted_object?.page_id
      if (p) ids.add(String(p))
    }
    return [...ids]
  } catch {
    return null
  }
}

/**
 * Tot ce se poate afla despre reclame cu token-ul curent.
 *
 * Bucățile care lipsesc ajung în avertismente. Când însă nu iese nimic de
 * arătat din cauza unei erori (token expirat, limită de cereri), aruncă — așa
 * pagina spune motivul, iar datele bune din cache nu sunt înlocuite cu un gol.
 */
export async function fetchAdsOverview() {
  const warnings = []
  const fail = (e) => { throw new MetaError(explainMetaError(e), e) }

  const [me, accountsRaw, pagesRaw] = await Promise.all([
    graph('me', { fields: 'id,name' }).catch(() => null),
    graphAll('me/adaccounts', {
      fields: 'id,account_id,name,currency,account_status,amount_spent,created_time',
    }, { maxPages: 3 }).catch(fail),
    graphAll('me/accounts', { fields: 'id,name,category' }, { maxPages: 3 })
      .catch((e) => { warnings.push(`Pagini: ${explainMetaError(e)}`); return [] }),
  ])

  let accounts = accountsRaw
  if (ACCOUNT_FILTER.length > 0) {
    accounts = accounts.filter((a) => ACCOUNT_FILTER.includes(a.id))
  }

  // Paginile promovate, ca să se vadă ce cont ține de ce brand
  await Promise.all(
    accounts.map(async (a) => { a.promotedPageIds = await promotedPages(a.id) })
  )

  const loaded = []
  const failures = []
  for (const account of accounts) {
    // Conturile altor branduri nu se mai citesc deloc: fiecare costă zeci de
    // cereri, iar Meta le limitează. Dacă nu s-a putut afla ce promovează
    // contul, îl citim totuși.
    if (
      PAGE_FILTER.length > 0 &&
      account.promotedPageIds &&
      !account.promotedPageIds.some((id) => PAGE_FILTER.includes(id))
    ) continue

    const problems = new Set()
    try {
      const data = await loadAccount(account, (e) => problems.add(explainMetaError(e)))
      if (problems.size > 0) warnings.push(`${account.name}: ${[...problems].join(' ')}`)
      // Conturile altor branduri dispar complet — nu au campanii pentru pagina
      // care ne interesează.
      if (PAGE_FILTER.length > 0 && data.campaigns.length === 0) continue
      loaded.push(data)
    } catch (e) {
      failures.push(e)
      warnings.push(`${account.name}: ${explainMetaError(e)}`)
    }
  }

  if (loaded.length === 0 && failures.length > 0) fail(failures[0])

  const allPages = pagesRaw.map((p) => ({ id: p.id, name: p.name, category: p.category || null }))
  const pages = PAGE_FILTER.length > 0
    ? allPages.filter((p) => PAGE_FILTER.includes(p.id))
    : allPages

  const pageName = (id) => allPages.find((p) => p.id === id)?.name || id

  // Totalurile de peste tot
  const totals = loaded.reduce((acc, a) => ({
    spend: acc.spend + a.totals.spend,
    impressions: acc.impressions + a.totals.impressions,
    reach: acc.reach + a.totals.reach,
    clicks: acc.clicks + a.totals.clicks,
    linkClicks: acc.linkClicks + a.totals.linkClicks,
    leads: acc.leads + a.totals.leads,
    messages: acc.messages + a.totals.messages,
    replies: acc.replies + a.totals.replies,
    purchases: acc.purchases + a.totals.purchases,
    videoViews: acc.videoViews + a.totals.videoViews,
    postEngagement: acc.postEngagement + a.totals.postEngagement,
    spentAllTime: acc.spentAllTime + a.amountSpentAllTime,
  }), {
    spend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, leads: 0,
    messages: 0, replies: 0, purchases: 0, videoViews: 0, postEngagement: 0,
    spentAllTime: 0,
  })

  totals.costPerLead = totals.leads > 0 ? totals.spend / totals.leads : null
  totals.costPerMessage = totals.messages > 0 ? totals.spend / totals.messages : null
  totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
  totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : null

  // Lunile, adunate din toate conturile
  const monthMap = new Map()
  for (const account of loaded) {
    for (const m of account.monthly) {
      if (!m.month) continue
      const acc = monthMap.get(m.month) || {
        month: m.month, spend: 0, impressions: 0, clicks: 0, leads: 0,
        messages: 0, replies: 0,
      }
      acc.spend += m.spend
      acc.impressions += m.impressions
      acc.clicks += m.clicks
      acc.leads += m.leads
      acc.messages += m.messages
      acc.replies += m.replies
      monthMap.set(m.month, acc)
    }
  }
  const monthly = [...monthMap.values()].sort((a, b) => b.month.localeCompare(a.month))

  // Moneda: dacă toate conturile folosesc aceeași, o arătăm; altfel, mix
  const currencies = [...new Set(loaded.map((a) => a.currency).filter(Boolean))]

  const windowSince = loaded.length > 0
    ? loaded.map((a) => a.windowSince).sort()[0]
    : null

  return {
    user: me ? { id: me.id, name: me.name } : null,
    windowSince,
    filteredByPages: PAGE_FILTER.length > 0
      ? PAGE_FILTER.map((id) => ({ id, name: pageName(id) }))
      : null,
    accounts: loaded,
    pages,
    totals,
    monthly,
    currency: currencies.length === 1 ? currencies[0] : null,
    currencies,
    warnings,
    fetchedAt: new Date().toISOString(),
  }
}

/** Detalii despre token: cui aparține, ce drepturi are, când expiră accesul. */
export async function fetchTokenInfo() {
  const res = await graph('debug_token', { input_token: TOKEN })
  const d = res.data || {}
  return {
    valid: !!d.is_valid,
    appName: d.application || null,
    type: d.type || null,
    scopes: d.scopes || [],
    expiresAt: d.expires_at ? new Date(d.expires_at * 1000).toISOString() : null,
    dataAccessExpiresAt: d.data_access_expires_at
      ? new Date(d.data_access_expires_at * 1000).toISOString()
      : null,
  }
}
