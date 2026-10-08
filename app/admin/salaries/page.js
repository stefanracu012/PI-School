import PermissionGuard from '@/components/admin/PermissionGuard'
import SalariesClient from './SalariesClient'

export const dynamic = 'force-dynamic'

export default function SalariesPage() {
  return (
    <PermissionGuard permissions={['salaries.view', 'salaries.edit', 'salaries.delete']} any>
      <SalariesClient />
    </PermissionGuard>
  )
}
