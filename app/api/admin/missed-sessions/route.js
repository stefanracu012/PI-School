import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET - Listează toate sesiunile ratate
export async function GET(request) {
  const session = await getServerSession(authOptions)
  
  if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const acknowledged = searchParams.get('acknowledged')
  const groupId = searchParams.get('groupId')

  try {
    const where = {}
    
    if (acknowledged !== null && acknowledged !== undefined) {
      where.acknowledged = acknowledged === 'true'
    }
    
    if (groupId) {
      where.groupId = groupId
    }

    const missedSessions = await prisma.missedSession.findMany({
      where,
      include: {
        group: {
          include: {
            course: true,
            teacher: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: { scheduledDate: 'desc' }
    })

    return NextResponse.json(missedSessions)
  } catch (error) {
    console.error('Error fetching missed sessions:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PUT - Marchează o sesiune ratată ca acknowledged
export async function PUT(request) {
  const session = await getServerSession(authOptions)
  
  if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id, acknowledged } = await request.json()

    const missedSession = await prisma.missedSession.update({
      where: { id },
      data: { acknowledged }
    })

    return NextResponse.json(missedSession)
  } catch (error) {
    console.error('Error updating missed session:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Șterge o sesiune ratată sau toate
export async function DELETE(request) {
  const session = await getServerSession(authOptions)
  
  if (!session || !['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const deleteAll = searchParams.get('deleteAll')
  const acknowledged = searchParams.get('acknowledged')

  try {
    // Ștergere în bulk
    if (deleteAll === 'true') {
      const where = {}
      if (acknowledged !== null && acknowledged !== undefined) {
        where.acknowledged = acknowledged === 'true'
      }

      const result = await prisma.missedSession.deleteMany({ where })
      return NextResponse.json({ success: true, count: result.count })
    }

    // Ștergere individuală
    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 })
    }

    await prisma.missedSession.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting missed session:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
