import { NextResponse } from 'next/server'
import { currentSalaryUser, parsePeriod, teacherSalaryDetail } from '@/lib/salary'

// GET ?period=YYYYMM|all&deleted=1 — fișa de salariu a unui profesor
export async function GET(request, { params }) {
  const me = await currentSalaryUser()
  if (!me) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })
  if (!me.access.view) return NextResponse.json({ error: 'Nu ai acces la salarii' }, { status: 403 })

  try {
    const { teacherId } = await params
    if (!/^[a-f0-9]{24}$/.test(teacherId || '')) {
      return NextResponse.json({ error: 'Profesor invalid' }, { status: 400 })
    }
    const { searchParams } = new URL(request.url)
    const detail = await teacherSalaryDetail(teacherId, parsePeriod(searchParams.get('period')), {
      includeDeleted: searchParams.get('deleted') === '1',
    })
    if (!detail) return NextResponse.json({ error: 'Profesorul nu există' }, { status: 404 })
    return NextResponse.json({ ...detail, access: me.access })
  } catch (error) {
    console.error('Eroare la fișa de salariu:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
