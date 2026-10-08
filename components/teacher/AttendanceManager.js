'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { CheckIcon, XMarkIcon, MinusIcon, PencilIcon, ChevronDownIcon, ChevronUpIcon, LockClosedIcon } from '@heroicons/react/24/outline'

export default function AttendanceManager({ sessionId, groupId, students, lessonsDeducted, isExpired = false, sessionDate, billingType = 'MONTHLY' }) {
  const router = useRouter()
  const [attendances, setAttendances] = useState(() => {
    const initial = {}
    students.forEach(gs => {
      initial[gs.studentId] = gs.attendance?.status || null
    })
    return initial
  })
  const [studentNotes, setStudentNotes] = useState(() => {
    const initial = {}
    students.forEach(gs => {
      initial[gs.studentId] = gs.attendance?.notes || ''
    })
    return initial
  })
  const [expandedStudent, setExpandedStudent] = useState(null)
  const [savingNotes, setSavingNotes] = useState({})
  const [deducting, setDeducting] = useState(false)

  const markAttendance = async (studentId, status) => {
    // Optimistic update
    setAttendances(prev => ({ ...prev, [studentId]: status }))

    try {
      const res = await fetch('/api/teacher/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          studentId,
          status
        })
      })

      if (!res.ok) {
        // Revert on error
        setAttendances(prev => ({ ...prev, [studentId]: students.find(s => s.studentId === studentId)?.attendance?.status || null }))
        toast.error('Eroare la marcare')
      }
    } catch (error) {
      toast.error('Eroare la marcare')
    }
  }

  const saveStudentNotes = async (studentId) => {
    setSavingNotes(prev => ({ ...prev, [studentId]: true }))
    try {
      const res = await fetch('/api/teacher/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          studentId,
          notes: studentNotes[studentId]
        })
      })

      if (res.ok) {
        toast.success('Notițele au fost salvate!')
      } else {
        toast.error('Eroare la salvarea notițelor')
      }
    } catch (error) {
      toast.error('Eroare la salvarea notițelor')
    } finally {
      setSavingNotes(prev => ({ ...prev, [studentId]: false }))
    }
  }

  const toggleExpanded = (studentId) => {
    setExpandedStudent(expandedStudent === studentId ? null : studentId)
  }

  const deductLessons = async () => {
    // Check all students have attendance marked
    const unmarked = students.filter(s => !attendances[s.studentId])
    if (unmarked.length > 0) {
      toast.error('Marchează prezența pentru toți elevii înainte de deducere')
      return
    }

    if (!confirm('Sigur doriți să deduceți lecțiile? Această acțiune este ireversibilă.')) {
      return
    }

    setDeducting(true)
    try {
      const res = await fetch('/api/teacher/sessions/deduct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      })

      if (res.ok) {
        toast.success('Lecțiile au fost deduse cu succes!')
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Eroare la deducere')
      }
    } catch (error) {
      toast.error('Eroare la deducere')
    } finally {
      setDeducting(false)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'PRESENT': return 'bg-green-100 border-green-500 text-green-700'
      case 'ABSENT': return 'bg-red-100 border-red-500 text-red-700'
      default: return 'bg-gray-100 border-gray-300 text-gray-500'
    }
  }

  const presentCount = Object.values(attendances).filter(s => s === 'PRESENT').length
  const absentCount = Object.values(attendances).filter(s => s === 'ABSENT').length

  return (
    <div className="bg-white rounded-xl shadow-sm p-3 xs:p-4 md:p-6">
      <div className="flex flex-col gap-3 xs:gap-4 mb-4 xs:mb-6">
        <div>
          <h2 className="text-base xs:text-lg md:text-xl font-bold text-gray-900">Marcarea Prezenței</h2>
          <p className="text-gray-600 text-xs xs:text-sm mt-1">
            Prezenți: <span className="font-medium text-green-600">{presentCount}</span> |
            Absenți: <span className="font-medium text-red-600">{absentCount}</span> |
            Nemarcați: <span className="font-medium text-gray-600">{students.length - presentCount - absentCount}</span>
          </p>
        </div>

        {!lessonsDeducted && (
          <button
            onClick={deductLessons}
            disabled={deducting}
            className="flex items-center justify-center gap-1.5 xs:gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 xs:px-5 md:px-6 py-2.5 xs:py-3 rounded-lg text-xs xs:text-sm md:text-base font-medium transition-colors disabled:opacity-50 w-full xs:w-auto"
          >
            <MinusIcon className="w-4 h-4 xs:w-5 xs:h-5" />
            {deducting ? 'Se deduc...' : 'Scade Lecțiile'}
          </button>
        )}
      </div>

      {lessonsDeducted && (
        <div className="mb-4 xs:mb-6 p-3 xs:p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800 font-medium text-xs xs:text-sm">
            ✓ Lecțiile pentru această sesiune au fost deduse.
          </p>
        </div>
      )}

      {isExpired && (
        <div className="mb-4 xs:mb-6 p-3 xs:p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start xs:items-center gap-2 xs:gap-3">
          <LockClosedIcon className="w-4 h-4 xs:w-5 xs:h-5 text-amber-600 flex-shrink-0 mt-0.5 xs:mt-0" />
          <p className="text-amber-800 text-xs xs:text-sm">
            <strong>Sesiune blocată:</strong> Au trecut mai mult de 24 de ore de la această sesiune. Nu mai poți adăuga sau modifica notițe. Contactează un administrator pentru modificări.
          </p>
        </div>
      )}

      <div className="space-y-2 xs:space-y-3">
        {students.map(gs => (
          <div
            key={gs.studentId}
            className={`rounded-lg border-2 transition-colors ${getStatusColor(attendances[gs.studentId])}`}
          >
            <div className="flex items-center justify-between p-2.5 xs:p-3 md:p-4 gap-2">
              <div className="flex items-center gap-2 xs:gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 xs:w-9 xs:h-9 md:w-10 md:h-10 bg-white rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                  <span className="font-medium text-gray-700 text-xs xs:text-sm">
                    {gs.student?.fullName?.charAt(0) || 'E'}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 text-xs xs:text-sm md:text-base truncate">{gs.student?.fullName || 'Elev'}</p>
                  <div className="flex flex-col xs:flex-row xs:items-center xs:gap-2 text-[10px] xs:text-xs md:text-sm text-gray-500">
                    {billingType === 'INDIVIDUAL' && (
                      <span className="whitespace-nowrap">Lecții: <span className="font-medium">{gs.lessonsRemaining}</span></span>
                    )}
                    {(studentNotes[gs.studentId] || gs.attendance?.notes) && (
                      <span className="text-teal-600 whitespace-nowrap"><span className="hidden xs:inline">•</span> Are notițe</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 xs:gap-2 flex-shrink-0">
                {!lessonsDeducted ? (
                  <>
                    <button
                      onClick={() => toggleExpanded(gs.studentId)}
                      className="p-1.5 xs:p-2 rounded-lg bg-white text-gray-500 hover:bg-gray-50 border border-gray-300"
                      title="Notițe"
                    >
                      {expandedStudent === gs.studentId ? (
                        <ChevronUpIcon className="w-4 h-4 xs:w-5 xs:h-5" />
                      ) : (
                        <PencilIcon className="w-4 h-4 xs:w-5 xs:h-5" />
                      )}
                    </button>
                    <button
                      onClick={() => markAttendance(gs.studentId, 'PRESENT')}
                      className={`p-2 xs:p-2.5 md:p-3 rounded-lg transition-colors ${
                        attendances[gs.studentId] === 'PRESENT'
                          ? 'bg-green-500 text-white'
                          : 'bg-white text-green-600 hover:bg-green-50 border border-green-300'
                      }`}
                      title="Prezent"
                    >
                      <CheckIcon className="w-4 h-4 xs:w-5 xs:h-5" />
                    </button>
                    <button
                      onClick={() => markAttendance(gs.studentId, 'ABSENT')}
                      className={`p-2 xs:p-2.5 md:p-3 rounded-lg transition-colors ${
                        attendances[gs.studentId] === 'ABSENT'
                          ? 'bg-red-500 text-white'
                          : 'bg-white text-red-600 hover:bg-red-50 border border-red-300'
                      }`}
                      title="Absent"
                    >
                      <XMarkIcon className="w-4 h-4 xs:w-5 xs:h-5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => toggleExpanded(gs.studentId)}
                      className="p-1.5 xs:p-2 rounded-lg bg-white text-gray-500 hover:bg-gray-50 border border-gray-300"
                      title="Notițe"
                    >
                      {expandedStudent === gs.studentId ? (
                        <ChevronUpIcon className="w-4 h-4 xs:w-5 xs:h-5" />
                      ) : (
                        <PencilIcon className="w-4 h-4 xs:w-5 xs:h-5" />
                      )}
                    </button>
                    <span className={`px-2 xs:px-2.5 md:px-3 py-1 rounded-full text-[10px] xs:text-xs md:text-sm font-medium whitespace-nowrap ${
                      attendances[gs.studentId] === 'PRESENT'
                        ? 'bg-green-500 text-white'
                        : 'bg-red-500 text-white'
                    }`}>
                      {attendances[gs.studentId] === 'PRESENT' ? 'Prezent' : 'Absent'}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Expanded notes section */}
            {expandedStudent === gs.studentId && (
              <div className="px-2.5 xs:px-3 md:px-4 pb-2.5 xs:pb-3 md:pb-4 border-t border-gray-200 bg-white rounded-b-lg">
                <div className="pt-2 xs:pt-3">
                  <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1.5 xs:mb-2">
                    Notițe pentru {gs.student?.fullName?.split(' ')[0] || 'elev'}
                  </label>

                  {isExpired ? (
                    // Read-only mode after 24h
                    <div>
                      {studentNotes[gs.studentId] ? (
                        <div className="p-2 xs:p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs xs:text-sm text-gray-700">
                          {studentNotes[gs.studentId]}
                        </div>
                      ) : (
                        <p className="text-xs xs:text-sm text-gray-500 italic">Nu există notițe.</p>
                      )}
                      <div className="flex items-center gap-1.5 xs:gap-2 mt-1.5 xs:mt-2 text-amber-600 text-[10px] xs:text-xs md:text-sm">
                        <LockClosedIcon className="w-3 h-3 xs:w-4 xs:h-4 flex-shrink-0" />
                        <span>Sesiunea a trecut de 24h - nu mai poți modifica notițele</span>
                      </div>
                    </div>
                  ) : (
                    // Editable mode within 24h
                    <>
                      <textarea
                        value={studentNotes[gs.studentId] || ''}
                        onChange={(e) => setStudentNotes(prev => ({ ...prev, [gs.studentId]: e.target.value }))}
                        rows={3}
                        className="w-full px-2.5 xs:px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none text-xs xs:text-sm text-gray-900"
                        placeholder="Ex: S-a descurcat excelent, a fost absent din motive medicale, trebuie să recupereze tema..."
                      />
                      <div className="flex justify-end mt-1.5 xs:mt-2">
                        <button
                          onClick={() => saveStudentNotes(gs.studentId)}
                          disabled={savingNotes[gs.studentId]}
                          className="px-2.5 xs:px-3 py-1.5 bg-teal-600 text-white text-xs xs:text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                        >
                          {savingNotes[gs.studentId] ? 'Se salvează...' : 'Salvează'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {!lessonsDeducted && students.length > 0 && (
        <div className="mt-4 xs:mt-6 p-3 xs:p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-amber-800 text-xs xs:text-sm">
            <strong>Important:</strong> După marcarea tuturor prezențelor, apăsați butonul "Scade Lecțiile" pentru a deduce automat lecțiile elevilor prezenți și a incrementa absențele celor absenți.
          </p>
        </div>
      )}

      {/* Tip for notes - only show if not expired */}
      {!isExpired && (
        <div className="mt-3 xs:mt-4 p-2.5 xs:p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-gray-600 text-xs xs:text-sm flex items-start gap-1">
            <PencilIcon className="w-3 h-3 xs:w-4 xs:h-4 inline-block flex-shrink-0 mt-0.5" />
            <span><strong>Tip:</strong> Apasă pe iconița de creion pentru a adăuga notițe despre fiecare elev (motive absență, performanță, observații, etc.)</span>
          </p>
        </div>
      )}
    </div>
  )
}
