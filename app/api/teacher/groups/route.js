import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { NOT_COMPLETED } from '@/lib/group-filters'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const groups = await prisma.group.findMany({
      where: { 
        teacherId: session.user.id,
        active: true,
        ...NOT_COMPLETED,
      },
      include: {
        branch: true,
        groupStudents: {
          where: { status: 'ACTIVE' },
          include: { student: true }
        }
      },
      orderBy: { name: 'asc' }
    })

    return NextResponse.json({ groups })
  } catch (error) {
    console.error('Error fetching teacher groups:', error)
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 })
  }
}
