export const dynamic = 'force-dynamic'

import prisma from '@/lib/prisma'
import GroupForm from '@/components/admin/GroupForm'

export default async function NewGroupPage() {
  const [teachers, branches] = await Promise.all([
    prisma.user.findMany({ where: { role: 'TEACHER', active: true } }),
    prisma.branch.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  ])

  return (
    <div className="space-y-4 xs:space-y-6">
      <div>
        <h1 className="text-xl xs:text-2xl font-bold text-gray-900">Adaugă grupă nouă</h1>
        <p className="text-sm xs:text-base text-gray-600">Creează o nouă grupă de studiu</p>
      </div>

      <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-3 xs:p-4 md:p-6">
        <GroupForm
          teachers={JSON.parse(JSON.stringify(teachers))}
          branches={JSON.parse(JSON.stringify(branches))}
        />
      </div>
    </div>
  )
}
