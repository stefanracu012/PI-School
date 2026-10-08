export const dynamic = 'force-dynamic'

import prisma from '@/lib/prisma'
import PermissionGuard from '@/components/admin/PermissionGuard'
import LeadsClient from './LeadsClient'

export default async function LeadsPage() {
  return (
    <PermissionGuard permission="leads.view">
      <LeadsPageContent />
    </PermissionGuard>
  )
}

async function LeadsPageContent() {
  // Lead-urile nu se mai aduc aici: pagina ar fi tras toată baza la fiecare
  // deschidere. Lista le cere paginat din /api/admin/leads, cu filtrele puse.
  const staff = await prisma.user.findMany({
    where: { active: true, role: { in: ['SUPERADMIN', 'ADMIN', 'TEACHER'] } },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })

  return <LeadsClient staff={JSON.parse(JSON.stringify(staff))} />
}
