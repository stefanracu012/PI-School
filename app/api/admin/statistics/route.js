import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPermission } from '@/lib/permissions'
import { buildStatistics } from '@/lib/statistics'

/**
 * Statistica școlii, pentru /admin/statistics.
 *
 * Calculul trece prin toate lead-urile, prezențele și plățile, așa că
 * răspunsul se ține un minut în memorie: pagina se redeschide des, iar
 * cifrele nu se schimbă de la un clic la altul.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_MS = 60 * 1000
const cache = new Map()

export async function GET(request) {
  const session = await getServerSession(authOptions)
  if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const perm = await checkPermission('statistics.view')
  if (!perm.allowed) {
    return NextResponse.json({ error: 'Nu ai permisiunea să vezi statistica' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'month'
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const refresh = searchParams.get('refresh') === '1'

    const key = `${period}|${from || ''}|${to || ''}`
    const hit = cache.get(key)
    if (!refresh && hit && Date.now() - hit.at < CACHE_MS) {
      return NextResponse.json({ ...hit.data, cached: true })
    }

    const data = await buildStatistics({ period, from, to })
    cache.set(key, { at: Date.now(), data })

    return NextResponse.json({ ...data, cached: false })
  } catch (error) {
    console.error('Eroare la calculul statisticii:', error)
    return NextResponse.json({ error: error.message || 'Eroare server' }, { status: 500 })
  }
}
