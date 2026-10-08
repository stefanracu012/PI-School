import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getMetaLeadSettings, setMetaLeadsEnabled, syncConversationsToLeads } from '@/lib/meta-leads'
import { isConfigured } from '@/lib/meta-messages'

/**
 * Comutatorul „conversațiile devin lead-uri" — doar SUPERADMIN.
 *
 * GET             → starea curentă
 * PUT  { enabled }→ pornește / oprește
 * POST            → sincronizează acum (manual)
 * POST ?dry=1     → arată ce s-ar crea, fără să scrie nimic
 */

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

async function requireSuperadmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { error: 'Neautentificat', status: 401 }
  if (session.user.role !== 'SUPERADMIN') {
    return { error: 'Doar superadminul poate schimba această setare', status: 403 }
  }
  return { userId: session.user.id }
}

const state = (settings) => ({
  enabled: !!settings.metaLeadsEnabled,
  lastSyncAt: settings.metaLeadsLastSyncAt ? settings.metaLeadsLastSyncAt.toISOString() : null,
  totalCreated: settings.metaLeadsCreated || 0,
  tokenConfigured: isConfigured(),
})

export async function GET() {
  const auth = await requireSuperadmin()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const settings = await getMetaLeadSettings()
  return NextResponse.json(state(settings))
}

export async function PUT(request) {
  const auth = await requireSuperadmin()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { enabled } = await request.json()
  const settings = await setMetaLeadsEnabled(enabled, auth.userId)

  return NextResponse.json(state(settings))
}

export async function POST(request) {
  const auth = await requireSuperadmin()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const dryRun = new URL(request.url).searchParams.get('dry') === '1'

  try {
    const settings = await getMetaLeadSettings()
    // Repetiția uscată merge și cu funcția oprită — tocmai ca să te uiți întâi
    if (!settings.metaLeadsEnabled && !dryRun) {
      return NextResponse.json({ error: 'Funcția e oprită — pornește-o mai întâi' }, { status: 400 })
    }

    const result = await syncConversationsToLeads({ dryRun })
    const updated = await getMetaLeadSettings()

    return NextResponse.json({ ...result, ...state(updated) })
  } catch (error) {
    console.error('Eroare la sincronizarea lead-urilor din Meta:', error)
    return NextResponse.json({ error: error.message || 'Sincronizarea a eșuat' }, { status: 502 })
  }
}
