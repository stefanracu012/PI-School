import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import TeacherGroupsClient from './TeacherGroupsClient'

export default async function TeacherGroupsPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Get valid teacher IDs to filter out orphan groups (teacher deleted directly from DB)
  const validTeachers = await prisma.user.findMany({ select: { id: true } })
  const validTeacherIds = validTeachers.map(t => t.id)

  const [groups, courses, branches, allGroups] = await Promise.all([
    prisma.group.findMany({
      where: { teacherId: session.user.id },
      include: {
        course: true,
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
    prisma.course.findMany({
      where: { active: true },
      orderBy: { title: 'asc' },
      select: { id: true, title: true }
    }),
    prisma.branch.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true }
    }),
    // Get all groups for schedule display (only groups with valid teachers)
    prisma.group.findMany({
      where: { active: true, teacherId: { in: validTeacherIds } },
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
      courses={courses} 
      branches={branches}
      allGroups={allGroups}
    />
  )
}
