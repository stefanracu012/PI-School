'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { PencilSquareIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { usePermissions } from '@/hooks/usePermissions'
import { monthOptions } from '@/lib/payments'

// Cât timp poate profesorul să corecteze singur, fără administrație (ca pe server)
const ACTION_WINDOW_HOURS = 24

/**
 * Editarea/ștergerea unei plăți deja înregistrate, direct din lista de elevi
 * a grupei. Doar plata lui, doar cât e proaspătă (sau cu dreptul fără limită).
 */
export default function PaymentCorrectionControls({ payment, billingType }) {
  const router = useRouter()
  const { user, hasPermission, isSuperAdmin } = usePermissions()

  const canAct = (permission) => {
    if (isSuperAdmin) return true
    if (!hasPermission(permission)) return false
    if (['SUPERADMIN', 'ADMIN'].includes(user?.role)) return true
    if (hasPermission('teacher.noTimeLimit')) return true
    if (!payment.createdAt) return false
    const hours = (Date.now() - new Date(payment.createdAt).getTime()) / 3600000
    return hours < ACTION_WINDOW_HOURS
  }

  const canEdit = canAct('teacher.payment.edit')
  const canDelete = canAct('teacher.payment.delete')

  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(payment.amount ?? ''))
  const [debt, setDebt] = useState(payment.debt != null ? String(payment.debt) : '')
  const [notes, setNotes] = useState(payment.notes || '')
  const [forPeriod, setForPeriod] = useState(
    payment.forYear && payment.forMonth ? `${payment.forYear}-${payment.forMonth}` : ''
  )
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (!canEdit && !canDelete) return null

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/teacher/my-payments/${payment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          debt: debt === '' ? null : debt,
          notes,
          ...(billingType !== 'INDIVIDUAL'
            ? {
                forYear: forPeriod ? parseInt(forPeriod.split('-')[0], 10) : null,
                forMonth: forPeriod ? parseInt(forPeriod.split('-')[1], 10) : null,
              }
            : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Eroare la salvare')

      toast.success('Plata a fost corectată')
      setEditing(false)
      router.refresh()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    const note = payment.lessonsAdded > 0
      ? '\n\nLecțiile adăugate de această plată se scad din pachetul elevului.'
      : ''
    if (!confirm(`Ștergi plata de ${payment.amount} MDL?${note}`)) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/teacher/my-payments/${payment.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Eroare la ștergere')
      toast.success('Plata a fost ștearsă')
      router.refresh()
    } catch (error) {
      toast.error(error.message)
      setDeleting(false)
    }
  }

  return (
    <>
      <span className="inline-flex items-center gap-1 ml-1">
        {canEdit && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditing(true) }}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            title="Editează plata"
          >
            <PencilSquareIcon className="w-3.5 h-3.5" />
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); remove() }}
            disabled={deleting}
            className="p-1 rounded hover:bg-red-50 text-gray-500 hover:text-red-600 disabled:opacity-50"
            title="Șterge plata"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </span>

      {editing && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => { e.stopPropagation(); setEditing(false) }}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-base font-semibold text-gray-900">Editează plata</h2>
              <button onClick={() => setEditing(false)} className="p-1 hover:bg-gray-100 rounded text-gray-700">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Sumă (MDL)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Datorie</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={debt}
                    onChange={(e) => setDebt(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {billingType !== 'INDIVIDUAL' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Pentru luna</label>
                  <select
                    value={forPeriod}
                    onChange={(e) => setForPeriod(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">Nespecificat</option>
                    {monthOptions().map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notițe</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Anulează
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="px-3 py-2 text-sm bg-[#30919f] text-white rounded-lg hover:bg-[#2a7d89] disabled:opacity-50"
                >
                  {saving ? 'Se salvează…' : 'Salvează'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
