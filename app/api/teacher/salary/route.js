import { NextResponse } from 'next/server'
import { currentSalaryUser, parsePeriod, teacherSalaryDetail } from '@/lib/salary'

// GET ?period=YYYYMM|all — salariul profesorului care e logat, doar al lui
export async function GET(request) {
  const me = await currentSalaryUser()
  if (!me) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })
  if (!me.access.own) return NextResponse.json({ error: 'Salariul nu e activat pentru contul tău' }, { status: 403 })

  try {
    const { searchParams } = new URL(request.url)
    const detail = await teacherSalaryDetail(me.user.id, parsePeriod(searchParams.get('period')))
    // Profesorul își vede salariul, nu poate umbla la el
    return NextResponse.json({ ...detail, access: { view: false, edit: false, delete: false, own: true } })
  } catch (error) {
    console.error('Eroare la salariul profesorului:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
