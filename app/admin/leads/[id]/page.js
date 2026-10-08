export const dynamic = 'force-dynamic'

import prisma from '@/lib/prisma'
import { notFound } from 'next/navigation'
import PermissionGuard from '@/components/admin/PermissionGuard'
import LeadDetailClient from './LeadDetailClient'

export default async function LeadDetailPage({ params }) {
  const { id } = await params
  return (
    <PermissionGuard permission="leads.view">
      <Content id={id} />
    </PermissionGuard>
  )
}

async function Content({ id }) {
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      leadNotes: { orderBy: { createdAt: 'desc' } },
      createdBy: { select: { name: true, email: true } },
    },
  })

  if (!lead) notFound()

  // Aceeași listă ca pe /admin/leads — fără ea, „Responsabil" din formular are doar „Nimeni"
  const staff = await prisma.user.findMany({
    where: { active: true, role: { in: ['SUPERADMIN', 'ADMIN', 'TEACHER'] } },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })

  return (
    <LeadDetailClient
      lead={JSON.parse(JSON.stringify(lead))}
      staff={JSON.parse(JSON.stringify(staff))}
    />
  )
}
