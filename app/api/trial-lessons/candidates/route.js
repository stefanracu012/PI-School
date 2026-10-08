import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * Lead-urile care pot fi programate la o lecție de probă.
 *
 * Endpoint minimal (id, nume, telefon, status), accesibil și profesorilor —
 * ei programează proba, dar nu au acces la restul CRM-ului de leads.
 */

const CLOSED = ['PLATIT', 'STUDIAZA', 'PLECAT', 'LOST_LEAD']

export async function GET(request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 })

  const q = (new URL(request.url).searchParams.get('q') || '').trim()

  try {
    const leads = await prisma.lead.findMany({
      where: {
        status: { notIn: CLOSED },
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { studentName: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, studentName: true, phone: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({
      leads: leads.map((l) => ({
        id: l.id,
        label: l.studentName ? `${l.studentName} (${l.name})` : l.name,
        phone: l.phone,
        status: l.status,
      })),
    })
  } catch (e) {
    console.error('Trial candidates GET error:', e)
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 })
  }
}
