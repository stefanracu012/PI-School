export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { checkPermission } from '@/lib/permissions'
import { paidForMonth, periodLabel } from '@/lib/payments'
import { getAgeGroup } from '@/lib/age-groups'
import { preferenceLabel } from '@/lib/lesson-preferences'
import AddPaymentButton from '@/components/admin/AddPaymentButton'
import {
  ArrowLeftIcon,
  PencilSquareIcon,
  AcademicCapIcon,
  CalendarDaysIcon,
  PhoneIcon,
  EnvelopeIcon,
  UserIcon,
  BanknotesIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'

const MONTH_NAMES = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

const STATUS_LABELS = {
  ACTIVE: { label: 'Activ', color: 'bg-green-100 text-green-700' },
  PAUSED: { label: 'Pauză', color: 'bg-amber-100 text-amber-700' },
  LEFT: { label: 'Plecat', color: 'bg-red-100 text-red-700' },
  COMPLETED: { label: 'Terminat', color: 'bg-blue-100 text-blue-700' },
  TRANSFERRED: { label: 'Transferat', color: 'bg-purple-100 text-purple-700' },
}

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'



export default async function StudentDetailPage({ params }) {
  await requireAdmin()
  const canView = await checkPermission('students.view')
  if (!canView.allowed) notFound()
  const canEdit = await checkPermission('students.edit')

  const { id } = await params

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      groupStudents: {
        include: {
          group: {
            include: { teacher: { select: { id: true, name: true } } },
          },
          payments: {
            orderBy: { paymentDate: 'desc' },
            include: { createdBy: { select: { name: true, role: true } } },
          },
        },
        orderBy: { enrolledAt: 'desc' },
      },
      createdBy: { select: { name: true, role: true } },
    },
  })

  if (!student) notFound()

  // Prezențele elevului, din sesiunile grupelor în care e înscris
  const attendances = await prisma.attendance.findMany({
    where: { studentId: id },
    select: {
      id: true,
      status: true,
      notes: true,
      session: {
        select: { date: true, groupId: true, group: { select: { name: true } } },
      },
    },
  })

  // Prezențele, grupate pe lună, în ordine cronologică — la fel ca în
  // tabelul grupei, ca lecția 1 să fie prima, nu ultima
  const byMonth = new Map()
  for (const a of [...attendances].sort((x, y) => new Date(x.session.date) - new Date(y.session.date))) {
    const d = new Date(a.session.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!byMonth.has(key)) {
      byMonth.set(key, {
        label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
        items: [],
        present: 0,
        absent: 0,
      })
    }
    const bucket = byMonth.get(key)
    bucket.items.push(a)
    if (a.status === 'PRESENT') bucket.present++
    else bucket.absent++
  }
  const attendanceMonths = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)

  const presentCount = attendances.filter((a) => a.status === 'PRESENT').length
  const absentCount = attendances.filter((a) => a.status === 'ABSENT').length

  const allPayments = student.groupStudents.flatMap((gs) =>
    gs.payments.map((p) => ({ ...p, groupName: gs.group.name }))
  )
  const totalPaid = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
  const now = new Date()
  const paidThisMonth = paidForMonth(allPayments, now.getFullYear(), now.getMonth() + 1)

  const activeGroups = student.groupStudents.filter(
    (gs) => !['LEFT', 'TRANSFERRED'].includes(gs.status)
  )

  return (
    <div className="space-y-4 xs:space-y-6">
      {/* Antet */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/admin/students" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-xl xs:text-2xl font-bold text-gray-900">{student.fullName}</h1>
            <p className="text-sm text-gray-600">
              {student.isAdult ? 'adult' : student.age ? `${student.age} ani` : 'vârstă nespecificată'}
              {student.level ? ` · ${student.level}` : ''}
              {!student.isAdult && student.grade ? ` · clasa ${student.grade}` : ''}
              {activeGroups.length > 0 ? ` · ${activeGroups.length} ${activeGroups.length === 1 ? 'grupă' : 'grupe'}` : ''}
              {student.startYear && student.startMonth
                ? ` · începe ${MONTH_NAMES[student.startMonth - 1]} ${student.startYear}`
                : ''}
              {getAgeGroup(student.age, student.isAdult)
                ? ` · ${getAgeGroup(student.age, student.isAdult).label}`
                : ''}
              {preferenceLabel(student) ? ` · ${preferenceLabel(student)}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <AddPaymentButton
            studentName={student.fullName}
            groups={student.groupStudents
              .filter((gs) => !['LEFT', 'TRANSFERRED'].includes(gs.status))
              .map((gs) => ({ groupStudentId: gs.id, groupName: gs.group.name, billingType: gs.group.billingType }))}
          />

        {canEdit.allowed && (
          <Link
            href={`/admin/students/${id}/edit`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <PencilSquareIcon className="h-4 w-4" />
            Editează
          </Link>
        )}
        </div>
      </div>

      {/* Sinteză */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Prezențe" value={presentCount} color="text-emerald-600" />
        <StatCard label="Absențe" value={absentCount} color="text-red-600" />
        <StatCard label="Total plătit" value={`${totalPaid.toLocaleString('ro-RO')} MDL`} color="text-gray-900" />
        <StatCard
          label="Luna curentă"
          value={paidThisMonth > 0 ? `${paidThisMonth.toLocaleString('ro-RO')} MDL` : 'neachitat'}
          color={paidThisMonth > 0 ? 'text-emerald-600' : 'text-red-600'}
        />
      </div>

      {/* Date de contact */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 xs:p-6">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-indigo-600" />
          Date de contact
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          {!student.isAdult && <Field label="Părinte" value={student.parentName} />}
          <Field label="Telefon">
            {student.parentPhone ? (
              <a href={`tel:${student.parentPhone}`} className="text-indigo-600 hover:underline flex items-center gap-1">
                <PhoneIcon className="h-4 w-4" />
                {student.parentPhone}
              </a>
            ) : '—'}
          </Field>
          <Field label="Email">
            {student.parentEmail ? (
              <a href={`mailto:${student.parentEmail}`} className="text-indigo-600 hover:underline flex items-center gap-1 break-all">
                <EnvelopeIcon className="h-4 w-4 shrink-0" />
                {student.parentEmail}
              </a>
            ) : '—'}
          </Field>
          <Field label="Adăugat" value={`${formatDate(student.createdAt)}${student.createdBy?.name ? ` · ${student.createdBy.name}` : ''}`} />
        </div>

        {student.notes && (
          <p className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-700 whitespace-pre-wrap">
            {student.notes}
          </p>
        )}
      </div>

      {/* Grupe */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 xs:p-6">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <AcademicCapIcon className="h-5 w-5 text-indigo-600" />
          Grupe
        </h2>

        {student.groupStudents.length === 0 ? (
          <p className="text-sm text-gray-500">Elevul nu e înscris în nicio grupă.</p>
        ) : (
          <div className="space-y-2">
            {student.groupStudents.map((gs) => {
              const status = STATUS_LABELS[gs.status] || STATUS_LABELS.ACTIVE
              const groupPaid = gs.payments.reduce((sum, p) => sum + (p.amount || 0), 0)
              return (
                <div key={gs.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/groups/${gs.groupId}`} className="font-medium text-gray-900 hover:text-indigo-600">
                      {gs.group.name}
                    </Link>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${status.color}`}>
                      {status.label}
                    </span>
                    {gs.group.level && (
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-medium">
                        {gs.group.level}
                      </span>
                    )}
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <CalendarDaysIcon className="h-3.5 w-3.5" />
                      din {formatDate(gs.enrolledAt)}
                    </span>
                    <span className="ml-auto text-xs text-gray-600">
                      profesor: {gs.group.teacher?.name || '—'}
                    </span>
                  </div>

                  {gs.statusNote && (
                    <p className="text-xs text-gray-500 mt-1">{gs.statusNote}</p>
                  )}

                  <p className="text-xs text-gray-600 mt-1.5">
                    Plătit în această grupă: <b>{groupPaid.toLocaleString('ro-RO')} MDL</b>
                    {` · ${gs.payments.length} ${gs.payments.length === 1 ? 'plată' : 'plăți'}`}
                    {gs.payments.some((p) => p.lessonsAdded) && (
                      <>
                        {' · '}
                        <b className="text-indigo-600">
                          +{gs.payments.reduce((sum, p) => sum + (p.lessonsAdded || 0), 0)} lecții cumpărate
                        </b>
                      </>
                    )}
                    {gs.group.billingType === 'INDIVIDUAL' && (
                      <>
                        {' · '}
                        <b className={
                          (gs.lessonsRemaining ?? 0) <= 0 ? 'text-red-600'
                            : (gs.lessonsRemaining ?? 0) <= 2 ? 'text-amber-600' : 'text-emerald-600'
                        }>
                          {gs.lessonsRemaining ?? 0} lecții rămase
                        </b>
                      </>
                    )}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Prezențe */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 xs:p-6">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
          Prezențe
        </h2>

        {attendanceMonths.length === 0 ? (
          <p className="text-sm text-gray-500">Nicio lecție înregistrată încă.</p>
        ) : (
          <div className="space-y-4">
            {attendanceMonths.map((m) => (
              <div key={m.label}>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <h3 className="text-sm font-semibold text-gray-900 capitalize">{m.label}</h3>
                  <span className="text-xs text-emerald-700">{m.present} prezent</span>
                  <span className="text-xs text-red-600">{m.absent} absent</span>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {m.items.map((a, i) => (
                    <div
                      key={a.id}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                        a.status === 'PRESENT'
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-red-200 bg-red-50'
                      }`}
                    >
                      <span className="text-gray-400 tabular-nums w-4 shrink-0">{i + 1}.</span>
                      <span className={a.status === 'PRESENT' ? 'text-emerald-700' : 'text-red-700'}>
                        {a.status === 'PRESENT' ? '✓' : '✗'}
                      </span>
                      <span className="font-medium text-gray-900">
                        {new Date(a.session.date).toLocaleDateString('ro-RO', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                        })}
                      </span>
                      <span className="text-gray-500 truncate">{a.session.group?.name || '—'}</span>
                      {a.notes && <span className="text-gray-400 truncate">· {a.notes}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Plăți */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 xs:p-6">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <BanknotesIcon className="h-5 w-5 text-emerald-600" />
          Istoric plăți
        </h2>

        {allPayments.length === 0 ? (
          <p className="text-sm text-gray-500">Nicio plată înregistrată.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Grupa</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pentru luna</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Lecții</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sumă</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Datorie</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Metodă</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Înregistrat de</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allPayments
                  .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))
                  .map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">{formatDate(p.paymentDate)}</td>
                      <td className="px-3 py-2 text-gray-700">{p.groupName}</td>
                      <td className="px-3 py-2 text-gray-700 capitalize whitespace-nowrap">{periodLabel(p)}</td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        {p.lessonsAdded ? (
                          <span className="font-semibold text-indigo-600">+{p.lessonsAdded}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-700 whitespace-nowrap">
                        {(p.amount || 0).toLocaleString('ro-RO')} MDL
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {p.debt > 0 ? (
                          <span className="font-semibold text-red-600">
                            {p.debt.toLocaleString('ro-RO')} MDL
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{p.paymentMethod || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{p.createdBy?.name || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 xs:p-4">
      <p className="text-[10px] xs:text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg xs:text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

function Field({ label, value, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <div className="text-gray-800 font-medium break-words">{children ?? value ?? '—'}</div>
    </div>
  )
}
