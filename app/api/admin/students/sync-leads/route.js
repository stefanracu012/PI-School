import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { syncAllStudents } from '@/lib/student-leads'

/**
 * Lead pentru fiecare elev existent — o singură dată, fără dubluri.
 *
 * GET  → ce s-ar face (nimic nu se scrie)
 * POST → face efectiv
 *
 * Doar SUPERADMIN: atinge toată lista de lead-uri deodată.
 */

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

async function requireSuperadmin() {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Doar superadminul poate rula sincronizarea' }, { status: 403 })
  }
  return null
}

export async function GET() {
  const denied = await requireSuperadmin()
  if (denied) return denied

  try {
    return NextResponse.json(await syncAllStudents({ dryRun: true }))
  } catch (e) {
    console.error('sync-leads (previzualizare):', e)
    return NextResponse.json({ error: e.message || 'Eroare' }, { status: 500 })
  }
}

export async function POST() {
  const denied = await requireSuperadmin()
  if (denied) return denied

  try {
    return NextResponse.json(await syncAllStudents({ dryRun: false }))
  } catch (e) {
    console.error('sync-leads:', e)
    return NextResponse.json({ error: e.message || 'Eroare' }, { status: 500 })
  }
}
