import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { checkPermission } from '@/lib/permissions'
import { isConfigured } from '@/lib/meta-ads'
import { readCache, writeCache } from '@/lib/external-cache'
import { ADS_KEY, FRESH_MS, loadAds, refreshInBackground } from '@/lib/ads-cache'

/**
 * Datele de reclame din Meta, pentru pagina /admin/ads.
 *
 * Citirea de la Meta durează secunde bune (conturi, campanii, luni), așa că
 * răspunsul se ține în baza de date, comun pentru toate instanțele, și se
 * împrospătează în fundal. Pagina se deschide cu ce știm deja; butonul
 * „Actualizează" cere date noi și așteaptă.
 */

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    await requireAdmin()

    const canView = await checkPermission('ads.view')
    if (!canView.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea să vezi reclamele' }, { status: 403 })
    }

    if (!isConfigured()) {
      return NextResponse.json({
        error: 'META_ACCESS_TOKEN nu este setat',
        hint: 'Adaugă token-ul Meta în variabilele de mediu (Vercel → Settings → Environment Variables) și redeployează.',
      }, { status: 503 })
    }

    const refresh = new URL(request.url).searchParams.get('refresh') === '1'

    // Un cache fără conturi nu are ce arăta — citim pe loc, ca să se vadă
    // fie cifrele, fie motivul pentru care Meta nu le dă
    if (!refresh) {
      const cached = await readCache(ADS_KEY)
      if (cached?.payload?.accounts?.length > 0) {
        if (cached.ageMs > FRESH_MS) refreshInBackground()
        return NextResponse.json({
          ...cached.payload,
          cached: true,
          ageMs: cached.ageMs,
          cachedAt: new Date(Date.now() - cached.ageMs).toISOString(),
        })
      }
    }

    const data = await loadAds()
    await writeCache(ADS_KEY, data)

    return NextResponse.json({ ...data, cached: false, ageMs: 0 })
  } catch (error) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('Eroare la citirea datelor Meta:', error)
    return NextResponse.json(
      { error: error.message || 'Nu s-au putut citi datele de la Meta' },
      { status: 502 }
    )
  }
}
