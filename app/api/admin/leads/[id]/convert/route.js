import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPermission } from '@/lib/permissions'
import { convertLeadToStudent } from '@/lib/lead-conversion'

/**
 * Trecerea manuală a unui lead în lista de elevi, fără a-i schimba statusul.
 * Aceeași logică ca la conversia automată: nu creează duplicate.
 */
export async function POST(request, { params }) {
  const session = await getServerSession(authOptions)
  if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Neautorizat' }, { status: 401 })
  }

  const perm = await checkPermission('students.create')
  if (!perm.allowed) {
    return NextResponse.json({ error: 'Nu ai permisiunea să adaugi elevi' }, { status: 403 })
  }

  try {
    const { id } = await params
    const lead = await prisma.lead.findUnique({ where: { id } })
    if (!lead) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 })

    if (lead.convertedStudentId || lead.convertedStudentIds?.length) {
      return NextResponse.json({
        created: false,
        studentId: lead.convertedStudentId,
        message: 'Lead-ul are deja un elev asociat',
      })
    }

    const result = await convertLeadToStudent(lead)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json(result)
  } catch (e) {
    console.error('Lead convert error:', e)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}
