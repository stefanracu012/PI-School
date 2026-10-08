import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPermission } from '@/lib/permissions'

// POST /api/admin/lead-notes — notiță nouă pe un lead
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Neautorizat' }, { status: 401 })

    const perm = await checkPermission('leads.edit')
    if (!perm.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea de a adăuga notițe' }, { status: 403 })
    }

    const { leadId, content } = await request.json()
    if (!leadId) return NextResponse.json({ error: 'Lead-ul este obligatoriu' }, { status: 400 })
    if (!content?.trim()) {
      return NextResponse.json({ error: 'Conținutul notiței este obligatoriu' }, { status: 400 })
    }

    const note = await prisma.leadNote.create({
      data: {
        leadId,
        content: content.trim(),
        authorName: session.user.name || session.user.email || null,
      },
    })

    return NextResponse.json(note)
  } catch (e) {
    console.error('Lead note POST error:', e)
    return NextResponse.json({ error: 'Eroare la crearea notiței' }, { status: 500 })
  }
}

// GET /api/admin/lead-notes?leadId=... — notițele unui lead
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Neautorizat' }, { status: 401 })

    const perm = await checkPermission('leads.view')
    if (!perm.allowed) return NextResponse.json({ error: 'Interzis' }, { status: 403 })

    const leadId = new URL(request.url).searchParams.get('leadId')
    if (!leadId) return NextResponse.json({ error: 'Lead-ul este obligatoriu' }, { status: 400 })

    const notes = await prisma.leadNote.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(notes)
  } catch (e) {
    console.error('Lead notes GET error:', e)
    return NextResponse.json({ error: 'Eroare la încărcarea notițelor' }, { status: 500 })
  }
}
