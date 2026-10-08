import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NOT_COMPLETED } from '@/lib/group-filters'
import TeacherGroupsClient from './TeacherGroupsClient'

export default async function TeacherGroupsPage() {
  const session = await getServerSession(authOptions)

  const [groups, branches, allGroups] = await Promise.all([
    prisma.group.findMany({
      where: { teacherId: session.user.id, ...NOT_COMPLETED },
      include: {
        groupStudents: {
          where: {
            status: { notIn: ['LEFT', 'TRANSFERRED'] }
          },
          include: { student: true }
        },
        lessonSessions: {
          orderBy: { date: 'desc' },
          take: 1
        }
      },
      orderBy: { name: 'asc' }
    }),
    prisma.branch.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true }
    }),
    // Get all groups for schedule display
    prisma.group.findMany({
      where: { active: true, ...NOT_COMPLETED },
      include: {
        teacher: { select: { name: true } },
        branch: { select: { name: true } }
      },
      orderBy: { name: 'asc' }
    })
  ])

  return (
    <TeacherGroupsClient 
      initialGroups={groups}
      branches={branches}
      allGroups={allGroups}
      isSuperTeacher={!!session.user?.superTeacher}
    />
  )
}
