'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { CheckCircleIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline'
import { PermissionGate } from '@/hooks/usePermissions'

/**
 * Încheierea unei grupe care și-a terminat cursul.
 *
 * Nu se șterge nimic: lecțiile, prezențele și plățile rămân întregi și se pot
 * vedea oricând din filtrul „Grupe terminate". Grupa doar iese din listele de
 * zi cu zi, din orar și din notificările de pe Telegram.
 */
export default function CompleteGroupButton({ groupId, groupName, completedAt }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const done = !!completedAt

  const toggle = async () => {
    const message = done
      ? `Redeschizi grupa „${groupName}"? Va reapărea în liste, în orar și în notificări.`
      : `Marchezi grupa „${groupName}" ca terminată?\n\n` +
        'Iese din liste, din orar și din notificările de pe Telegram. Istoricul ei — ' +
        'lecții, prezențe, plăți — rămâne neatins și îl vezi oricând din filtrul ' +
        '„Grupe terminate".'

    if (!confirm(message)) return

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/groups/${groupId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reopen: done }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare la salvare')

      toast.success(done ? 'Grupa a fost redeschisă' : 'Grupa a fost marcată ca terminată')
      router.refresh()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PermissionGate permission="groups.edit">
      <div
        className={`rounded-xl border p-3 xs:p-4 flex flex-wrap items-center justify-between gap-3 ${
          done ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'
        }`}
      >
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${done ? 'text-amber-900' : 'text-gray-900'}`}>
            {done ? 'Grupă terminată' : 'Grupa e încă în curs'}
          </p>
          <p className={`text-xs mt-0.5 ${done ? 'text-amber-800' : 'text-gray-500'}`}>
            {done
              ? `Încheiată pe ${new Date(completedAt).toLocaleDateString('ro-RO', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}. Nu apare în liste, în orar sau în notificări — dar istoricul ei e întreg.`
              : 'Când se termină cursul, marcheaz-o aici: iese din liste, din orar și din notificări, dar rămâne cu tot istoricul.'}
          </p>
        </div>

        <button
          type="button"
          onClick={toggle}
          disabled={saving}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex-shrink-0 ${
            done
              ? 'border border-amber-300 bg-white text-amber-900 hover:bg-amber-100'
              : 'bg-gray-800 text-white hover:bg-gray-900'
          }`}
        >
          {done ? (
            <>
              <ArrowUturnLeftIcon className="w-4 h-4" />
              {saving ? 'Se redeschide…' : 'Redeschide grupa'}
            </>
          ) : (
            <>
              <CheckCircleIcon className="w-4 h-4" />
              {saving ? 'Se salvează…' : 'Marchează terminată'}
            </>
          )}
        </button>
      </div>
    </PermissionGate>
  )
}
