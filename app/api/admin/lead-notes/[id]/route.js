import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPermission } from '@/lib/permissions'

// DELETE /api/admin/lead-notes/[id]
export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Neautorizat' }, { status: 401 })

    const perm = await checkPermission('leads.edit')
    if (!perm.allowed) {
      return NextResponse.json({ error: 'Nu ai permisiunea de a șterge notițe' }, { status: 403 })
    }

    const { id } = await params
    const note = await prisma.leadNote.findUnique({ where: { id } })
    if (!note) return NextResponse.json({ error: 'Notița nu a fost găsită' }, { status: 404 })

    await prisma.leadNote.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Lead note DELETE error:', e)
    return NextResponse.json({ error: 'Eroare la ștergerea notiței' }, { status: 500 })
  }
}
