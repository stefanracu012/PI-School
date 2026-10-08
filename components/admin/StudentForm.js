'use client'

import LevelSelect from '@/components/LevelSelect'
import { LESSON_TYPES, LOCATION_TYPES } from '@/lib/lesson-preferences'
import DuplicateStudentWarning from '@/components/admin/DuplicateStudentWarning'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import TwoFactorModal from './TwoFactorModal'

export default function StudentForm({ student }) {
  const router = useRouter()
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
  const [show2FA, setShow2FA] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)
  const [formData, setFormData] = useState({
    fullName: student?.fullName || '',
    age: student?.age || '',
    isAdult: student?.isAdult ?? false,
    startPeriod: student?.startYear && student?.startMonth
      ? `${student.startYear}-${String(student.startMonth).padStart(2, '0')}`
      : '',
    level: student?.level || '',
    lessonType: student?.lessonType || '',
    locationType: student?.locationType || '',
    grade: student?.grade || '',
    parentName: student?.parentName || '',
    parentPhone: student?.parentPhone || '',
    parentEmail: student?.parentEmail || '',
    notes: student?.notes || ''
  })

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Store the action and check 2FA
    setPendingAction({ type: 'submit' })
    if (session?.user?.twoFactorEnabled) {
      setShow2FA(true)
    } else {
      executeSubmit(null)
    }
  }

  const executeSubmit = async (actionToken) => {
    setShow2FA(false)
    setLoading(true)

    try {
      const url = student ? `/api/admin/students/${student.id}` : '/api/admin/students'
      const method = student ? 'PUT' : 'POST'

      const payload = {
        ...formData,
        age: formData.age ? parseInt(formData.age) : null,
        isAdult: !!formData.isAdult,
        level: formData.level || null,
        grade: formData.grade ? parseInt(formData.grade) : null,
        startYear: formData.startPeriod ? parseInt(formData.startPeriod.slice(0, 4)) : null,
        startMonth: formData.startPeriod ? parseInt(formData.startPeriod.slice(5, 7)) : null,
        // La adulți nu are rost clasa sau numele părintelui
        ...(formData.isAdult ? { grade: null, parentName: null } : {}),
      }
      if (actionToken) {
        payload.actionToken = actionToken
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        toast.success(student ? 'Elevul a fost actualizat' : 'Elevul a fost adăugat')
        router.push('/admin/students')
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'A apărut o eroare')
      }
    } catch (error) {
      toast.error('A apărut o eroare')
    } finally {
      setLoading(false)
      setPendingAction(null)
    }
  }

  const handle2FAVerify = (token) => {
    if (pendingAction?.type === 'submit') {
      executeSubmit(token)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nume complet *</label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            />
          </div>

          <DuplicateStudentWarning
            name={formData.fullName}
            phone={formData.parentPhone}
            excludeId={student?.id || null}
          />

          <div className="sm:col-span-2">
            <label className="flex items-start gap-2 p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300">
              <input
                type="checkbox"
                name="isAdult"
                checked={formData.isAdult}
                onChange={handleChange}
                className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">Elev adult</span>
                <span className="block text-xs text-gray-500">
                  Fără clasă și fără datele părintelui — contactul e al lui
                </span>
              </span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Începe din luna</label>
            <input
              type="month"
              name="startPeriod"
              value={formData.startPeriod}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            />
            <p className="mt-1 text-xs text-gray-500">
              Poate fi și peste ani. Până atunci elevul rămâne în listă, fără grupă.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cum învață</label>
            <select
              name="lessonType"
              value={formData.lessonType}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            >
              <option value="">Nespecificat</option>
              {LESSON_TYPES.map((o) => (
                <option key={o.value} value={o.value}>{o.emoji} {o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unde</label>
            <select
              name="locationType"
              value={formData.locationType}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            >
              <option value="">Nespecificat</option>
              {LOCATION_TYPES.map((o) => (
                <option key={o.value} value={o.value}>{o.emoji} {o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nivel</label>
            <LevelSelect
              value={formData.level}
              onChange={(e) => setFormData(prev => ({ ...prev, level: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
              emptyLabel="— Nespecificat —"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vârstă</label>
            <input
              type="number"
              name="age"
              value={formData.age}
              onChange={handleChange}
              min={3}
              max={99}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            />
          </div>

          <div className={formData.isAdult ? 'hidden' : ''}>
            <label className="block text-sm font-medium text-gray-700 mb-1">Clasa</label>
            <select
              name="grade"
              value={formData.grade}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            >
              <option value="">— Nespecificată —</option>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(g => (
                <option key={g} value={g}>Clasa {g}</option>
              ))}
            </select>
          </div>

          <div className={formData.isAdult ? 'hidden' : ''}>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nume părinte</label>
            <input
              type="text"
              name="parentName"
              value={formData.parentName}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formData.isAdult ? 'Telefon' : 'Telefon părinte'}
            </label>
            <input
              type="tel"
              name="parentPhone"
              value={formData.parentPhone}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formData.isAdult ? 'Email' : 'Email părinte'}
            </label>
            <input
              type="email"
              name="parentEmail"
              value={formData.parentEmail}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            />
          </div>
        </div>

        <div className="flex gap-4 pt-4 border-t">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
          >
            Anulează
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Se salvează...' : (student ? 'Actualizează' : 'Adaugă elev')}
          </button>
        </div>
      </form>

      <TwoFactorModal
        isOpen={show2FA}
        onClose={() => {
          setShow2FA(false)
          setPendingAction(null)
        }}
        onVerify={handle2FAVerify}
        title="Verificare 2FA"
        description={student ? 'Confirmă identitatea pentru a actualiza elevul.' : 'Confirmă identitatea pentru a adăuga elevul.'}
      />
    </>
  )
}
