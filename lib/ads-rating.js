/**
 * Cât de bună e o campanie, în cuvinte.
 *
 * Nu există un prag universal — „3 lei pe mesaj" e ieftin la Chișinău și
 * scump în altă parte. Așa că fiecare campanie se compară cu **mediana
 * propriilor voastre campanii**: jumătate sunt mai bune, jumătate mai slabe.
 * Asta răspunde la întrebarea care contează: marketologul a făcut treabă mai
 * bună sau mai slabă decât de obicei?
 *
 * Rezultatul unei campanii e conversația pornită sau lead-ul — ce urmărește
 * ea. Afișările și clicurile nu spun nimic singure: se plătesc, nu se încasează.
 */

export const RATINGS = {
  excellent: { level: 'excellent', label: 'Foarte bună', color: 'bg-emerald-100 text-emerald-800 border-emerald-300', order: 4 },
  good: { level: 'good', label: 'Bună', color: 'bg-lime-100 text-lime-800 border-lime-300', order: 3 },
  average: { level: 'average', label: 'Medie', color: 'bg-amber-100 text-amber-800 border-amber-300', order: 2 },
  poor: { level: 'poor', label: 'Slabă', color: 'bg-red-100 text-red-800 border-red-300', order: 1 },
  unknown: { level: 'unknown', label: 'Prea puține date', color: 'bg-gray-100 text-gray-600 border-gray-300', order: 0 },
}

/** Sub atâta cheltuială, orice concluzie ar fi ghicit. */
const MIN_SPEND = 5

const median = (numbers) => {
  const list = [...numbers].sort((a, b) => a - b)
  if (list.length === 0) return null
  const mid = Math.floor(list.length / 2)
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2
}

/** Rezultatele unei campanii: conversații pornite plus lead-uri. */
export const resultsOf = (stats) => (stats?.messages || 0) + (stats?.leads || 0)

/** Cât a costat un rezultat; null dacă n-a produs niciunul. */
export const costPerResult = (stats) => {
  const results = resultsOf(stats)
  return results > 0 ? (stats.spend || 0) / results : null
}

/**
 * Evaluează o listă de campanii, comparativ între ele.
 * @returns aceleași campanii, fiecare cu `rating: { level, label, color, reason }`
 */
export function rateCampaigns(campaigns) {
  const costs = campaigns
    .map((c) => costPerResult(c.stats))
    .filter((v) => v !== null && v > 0)

  const reference = median(costs)

  return campaigns.map((c) => {
    const spend = c.stats?.spend || 0
    const results = resultsOf(c.stats)
    const cost = costPerResult(c.stats)

    // Prea puțin cheltuit ca să însemne ceva
    if (spend < MIN_SPEND) {
      return { ...c, rating: { ...RATINGS.unknown, reason: 'prea puțin cheltuit ca să tragem o concluzie' } }
    }

    // A consumat buget fără niciun rezultat: asta se vede fără comparații
    if (results === 0) {
      return {
        ...c,
        rating: { ...RATINGS.poor, reason: 'a consumat buget fără nicio conversație sau lead' },
      }
    }

    if (!reference) {
      return { ...c, rating: { ...RATINGS.unknown, reason: 'nu avem cu ce compara' } }
    }

    const ratio = cost / reference
    const cheaper = Math.round((1 - ratio) * 100)
    const pricier = Math.round((ratio - 1) * 100)

    if (ratio <= 0.6) {
      return { ...c, rating: { ...RATINGS.excellent, reason: `cu ${cheaper}% mai ieftin pe rezultat decât media voastră` } }
    }
    if (ratio <= 1) {
      return { ...c, rating: { ...RATINGS.good, reason: cheaper > 0 ? `cu ${cheaper}% mai ieftin decât media voastră` : 'cât media voastră' } }
    }
    if (ratio <= 1.5) {
      return { ...c, rating: { ...RATINGS.average, reason: `cu ${pricier}% mai scump decât media voastră` } }
    }
    return { ...c, rating: { ...RATINGS.poor, reason: `de ${ratio.toFixed(1)} ori mai scump decât media voastră` } }
  })
}

/** Concluzia pe toate campaniile, pentru cardul de sus. */
export function summarizeRatings(campaigns) {
  const counts = { excellent: 0, good: 0, average: 0, poor: 0, unknown: 0 }
  let wastedSpend = 0
  let bestCampaign = null
  let worstCampaign = null

  for (const c of campaigns) {
    const level = c.rating?.level || 'unknown'
    counts[level] = (counts[level] || 0) + 1

    if (level === 'poor') wastedSpend += c.stats?.spend || 0

    const cost = costPerResult(c.stats)
    if (cost !== null && (c.stats?.spend || 0) >= MIN_SPEND) {
      if (!bestCampaign || cost < bestCampaign.cost) bestCampaign = { name: c.name, cost, results: resultsOf(c.stats) }
      if (!worstCampaign || cost > worstCampaign.cost) worstCampaign = { name: c.name, cost, results: resultsOf(c.stats) }
    }
  }

  const rated = counts.excellent + counts.good + counts.average + counts.poor

  return { counts, rated, wastedSpend, bestCampaign, worstCampaign }
}
