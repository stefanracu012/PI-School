import { notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/prisma'
import SessionCorrectionPanel from '@/components/teacher/SessionCorrectionPanel'

export const dynamic = 'force-dynamic'

/**
 * Sesiunea unei grupe, văzută din admin — deschisă din numărul lecției
 * afișat în tabelul de prezențe al grupei (LessonPackagePanel).
 *
 * Nu marchează prezența (asta e treaba profesorului, din pagina lui) — arată
 * ce s-a înregistrat și oferă corectarea: schimbarea prezenței, a datei sau
 * ștergerea, cu contabilitatea la zi.
 */
export default async function AdminSessionDetailPage({ params }) {
  const { id, sessionId } = await params

  const group = await prisma.group.findUnique({
    where: { id },
    select: { id: true, name: true, level: true, billingType: true, teacher: { select: { name: true } } },
  })
  if (!group) notFound()

  const lessonSession = await prisma.lessonSession.findUnique({
    where: { id: sessionId },
    include: { attendances: { include: { student: { select: { fullName: true } } } } },
  })
  if (!lessonSession || lessonSession.groupId !== id) notFound()

  return (
    <div className="space-y-4 xs:space-y-6">
      <div>
        <Link
          href={`/admin/groups/${id}`}
          className="text-indigo-600 hover:text-indigo-700 text-xs xs:text-sm mb-1.5 xs:mb-2 inline-block"
        >
          ← Înapoi la grupă
        </Link>
        <h1 className="text-lg xs:text-xl md:text-3xl font-bold text-gray-900">
          Sesiune — {new Date(lessonSession.date).toLocaleDateString('ro-RO', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })}
        </h1>
        <p className="text-gray-600 mt-0.5 xs:mt-1 text-xs xs:text-sm md:text-base">
          {group.name}{group.level ? ` • ${group.level}` : ''} • Profesor: {group.teacher?.name || '—'}
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-3 xs:p-4 md:p-6">
        <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2 xs:gap-4">
          <h2 className="text-base xs:text-lg md:text-xl font-bold text-gray-900">Status Sesiune</h2>
          {lessonSession.lessonsDeducted ? (
            <span className="px-2.5 xs:px-3 py-1 bg-green-100 text-green-800 text-xs xs:text-sm font-medium rounded-full">
              ✓ Lecții Deduse
            </span>
          ) : (
            <span className="px-2.5 xs:px-3 py-1 bg-amber-100 text-amber-800 text-xs xs:text-sm font-medium rounded-full">
              În Așteptare
            </span>
          )}
        </div>
        {lessonSession.notes && (
          <p className="text-sm text-gray-600 mt-2">Notițe: {lessonSession.notes}</p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-3 xs:p-4 md:p-6">
        <h2 className="text-base xs:text-lg font-bold text-gray-900 mb-3">
          Prezența elevilor ({lessonSession.attendances.length})
        </h2>
        {lessonSession.attendances.length === 0 ? (
          <p className="text-sm text-gray-500 italic">Nu s-a înregistrat prezența</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {lessonSession.attendances.map((a) => (
              <div
                key={a.id}
                className={`flex items-center justify-between p-2.5 rounded-lg ${
                  a.status === 'PRESENT' ? 'bg-green-50' : 'bg-red-50'
                }`}
              >
                <span className="text-sm font-medium text-gray-900">{a.student?.fullName}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  a.status === 'PRESENT' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {a.status === 'PRESENT' ? 'Prezent' : 'Absent'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <SessionCorrectionPanel
        session={{
          id: lessonSession.id,
          date: lessonSession.date,
          notes: lessonSession.notes,
          createdAt: lessonSession.createdAt,
          lessonsDeducted: lessonSession.lessonsDeducted,
          attendances: lessonSession.attendances.map((a) => ({
            id: a.id,
            status: a.status,
            notes: a.notes,
            student: { fullName: a.student?.fullName },
          })),
        }}
        groupId={id}
        backHref={`/admin/groups/${id}`}
      />
    </div>
  )
}
