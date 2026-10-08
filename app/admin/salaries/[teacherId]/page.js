import PermissionGuard from '@/components/admin/PermissionGuard'
import TeacherSalaryView from '@/components/salary/TeacherSalaryView'

export const dynamic = 'force-dynamic'

export default async function TeacherSalaryPage({ params }) {
  const { teacherId } = await params
  return (
    <PermissionGuard permissions={['salaries.view', 'salaries.edit', 'salaries.delete']} any>
      <TeacherSalaryView apiUrl={`/api/admin/salaries/teacher/${teacherId}`} backHref="/admin/salaries" adminView />
    </PermissionGuard>
  )
}
