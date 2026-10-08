import { NextResponse } from 'next/server'
import { clearImpersonation, readImpersonation } from '@/lib/impersonation'

export async function POST() {
  try {
    const existing = await readImpersonation()
    await clearImpersonation()
    return NextResponse.json({ 
      success: true, 
      wasImpersonating: !!existing,
      redirectTo: '/admin/teachers',
    })
  } catch (error) {
    console.error('Impersonate stop error:', error)
    return NextResponse.json({ error: 'Eroare la oprirea impersonării' }, { status: 500 })
  }
}
