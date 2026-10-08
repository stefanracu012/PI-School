import { redirect } from 'next/navigation'
import { currentSalaryUser } from '@/lib/salary'
import TeacherSalaryView from '@/components/salary/TeacherSalaryView'

export const dynamic = 'force-dynamic'

export default async function MySalaryPage() {
  // Pagina apare doar celor cărora administrația le-a activat salariul
  const me = await currentSalaryUser()
  if (!me?.access.own) redirect('/teacher')

  return <TeacherSalaryView apiUrl="/api/teacher/salary" />
}
