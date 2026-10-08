import { fetchAdsOverview, fetchTokenInfo } from '@/lib/meta-ads'
import { readCache, writeCache } from '@/lib/external-cache'
import { rateCampaigns, summarizeRatings } from '@/lib/ads-rating'

/**
 * Datele de reclame, ținute în cache comun.
 *
 * Citirea de la Meta durează secunde bune (conturi, campanii, luni la rând),
 * așa că răspunsul se păstrează în baza de date și se împrospătează în fundal
 * sau din cron. Pagina se deschide cu ce știm deja.
 */

export const ADS_KEY = 'meta:ads'
export const FRESH_MS = 30 * 60 * 1000   // sub o jumătate de oră, datele sunt bune

let refreshing = false

/** Citește de la Meta și pune nota fiecărei campanii. */
export async function loadAds() {
  const [data, token] = await Promise.all([
    fetchAdsOverview(),
    fetchTokenInfo().catch(() => null),
  ])

  // Evaluarea se face pe toate campaniile la un loc: comparația are sens doar
  // între campaniile aceleiași școli.
  const allCampaigns = data.accounts.flatMap((a) =>
    a.campaigns.map((c) => ({ ...c, currency: a.currency, accountName: a.name }))
  )
  const rated = rateCampaigns(allCampaigns)
  const ratingById = new Map(rated.map((c) => [c.id, c.rating]))

  const accounts = data.accounts.map((a) => ({
    ...a,
    campaigns: a.campaigns.map((c) => ({ ...c, rating: ratingById.get(c.id) || null })),
  }))

  return {
    ...data,
    accounts,
    token,
    rating: summarizeRatings(rated),
    fetchedAt: new Date().toISOString(),
  }
}

export function refreshInBackground() {
  if (refreshing) return
  refreshing = true

  loadAds()
    .then((data) => writeCache(ADS_KEY, data))
    .catch((e) => console.error('[ads] împrospătare eșuată:', e?.message))
    .finally(() => { refreshing = false })
}

/** Pentru cron: reîmprospătează doar dacă datele au început să se învechească. */
export async function warmAds({ force = false } = {}) {
  const cached = await readCache(ADS_KEY).catch(() => null)
  if (!force && cached?.payload?.accounts && cached.ageMs < FRESH_MS) {
    return { skipped: true, ageMs: cached.ageMs }
  }

  const data = await loadAds()
  await writeCache(ADS_KEY, data)
  return {
    refreshed: true,
    accounts: data.accounts.length,
    campaigns: data.accounts.reduce((n, a) => n + a.campaigns.length, 0),
  }
}
