export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import GroupForm from '@/components/admin/GroupForm'
import LessonPackagePanel from '@/components/groups/LessonPackagePanel'
import TrialLessonsPanel from '@/components/groups/TrialLessonsPanel'
import AdminStartSessionButton from '@/components/admin/AdminStartSessionButton'
import CompleteGroupButton from '@/components/admin/CompleteGroupButton'

export default async function EditGroupPage({ params }) {
  const { id } = await params
  
  const [group, teachers, branches, stats] = await Promise.all([
    prisma.group.findUnique({ where: { id }, include: { teacher: { select: { name: true } } } }),
    prisma.user.findMany({ where: { role: 'TEACHER', active: true } }),
    prisma.branch.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    // Rezumatul grupei: elevi, lecții ținute, încasări
    (async () => {
      const [studentsCount, sessionsCount, payments] = await Promise.all([
        prisma.groupStudent.count({ where: { groupId: id, status: { notIn: ['LEFT', 'TRANSFERRED'] } } }),
        prisma.lessonSession.count({ where: { groupId: id } }),
        prisma.payment.findMany({
          where: { groupStudent: { groupId: id } },
          select: { amount: true },
        }),
      ])
      return {
        studentsCount,
        sessionsCount,
        paid: payments.reduce((s, p) => s + (p.amount || 0), 0),
      }
    })(),
  ])

  if (!group) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
          <p className="text-gray-600">
            {group.isTrial && (
              <span className="inline-flex items-center px-1.5 py-0.5 mr-1.5 rounded bg-amber-100 text-amber-800 text-xs font-medium align-middle">
                lecție de probă
                {group.trialDate
                  ? ' · ' + new Date(group.trialDate).toLocaleString('ro-RO', {
                      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
                      timeZone: 'Europe/Chisinau',
                    })
                  : ''}
              </span>
            )}
            {group.level || 'fără nivel'} · {stats.studentsCount} elevi · {stats.sessionsCount} lecții ținute
            {stats.paid > 0 ? ` · ${stats.paid.toLocaleString('ro-RO')} lei încasați` : ''}
          </p>
        </div>

        {/* Istoricul complet al grupei, pentru arhivă sau contabilitate */}
        <div className="flex gap-2">
          <a
            href={`/api/admin/groups/${group.id}/export?format=csv`}
            className="px-3 py-1.5 border border-emerald-300 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-50 transition-colors"
          >
            Descarcă CSV
          </a>
          <a
            href={`/api/admin/groups/${group.id}/export?format=pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 border border-rose-300 text-rose-700 rounded-lg text-sm font-medium hover:bg-rose-50 transition-colors"
          >
            PDF
          </a>
        </div>
      </div>

      {/* Pornirea unei lecții la orice dată, când profesorul nu a apucat */}
      {group.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 xs:p-4">
          <p className="text-xs font-semibold text-amber-900 mb-1">Detalii despre grupă</p>
          <p className="text-sm text-amber-900 whitespace-pre-wrap">{group.notes}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 xs:p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Înregistrează o lecție</h2>
        <p className="text-xs text-gray-600 mb-3">
          Pentru cazurile în care lecția s-a ținut, dar nu a fost pornită din contul profesorului
        </p>
        <AdminStartSessionButton groupId={group.id} groupName={group.name} teacherName={group.teacher?.name || null} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <GroupForm 
          group={JSON.parse(JSON.stringify(group))}
          teachers={JSON.parse(JSON.stringify(teachers))}
          branches={JSON.parse(JSON.stringify(branches))}
        />
      </div>

      <CompleteGroupButton
        groupId={group.id}
        groupName={group.name}
        completedAt={group.completedAt ? group.completedAt.toISOString() : null}
      />

      {/* Pachetul lunar are sens doar la grupele care se repetă săptămânal;
          la o probă contează cine vine, o singură dată */}
      {group.isTrial ? (
        <TrialLessonsPanel groupId={group.id} />
      ) : (
        <LessonPackagePanel groupId={group.id} sessionHrefBase="/admin/groups" />
      )}
    </div>
  )
}
