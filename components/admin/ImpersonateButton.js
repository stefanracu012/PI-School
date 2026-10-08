'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { UserCircleIcon } from '@heroicons/react/24/outline'

/**
 * Buton SUPERADMIN: începe impersonarea unui ADMIN/TEACHER.
 * După succes, forțează refresh la pagina destinată target-ului.
 */
export default function ImpersonateButton({ userId, userName, userRole, className }) {
  const [loading, setLoading] = useState(false)

  const handleImpersonate = async () => {
    if (!confirm(`Vrei să te loghezi ca ${userName} (${userRole === 'TEACHER' ? 'Profesor' : 'Administrator'})?\n\nVei putea reveni la contul tău din bannerul din partea de sus.`)) {
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/impersonate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Eroare la impersonare')
        setLoading(false)
        return
      }

      toast.success(`Acum ești logat ca ${data.targetName}`)
      // Hard navigate ca să forțeze re-evaluarea sesiunii pe server
      window.location.href = data.redirectTo || '/admin'
    } catch (e) {
      toast.error('Eroare la impersonare')
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleImpersonate}
      disabled={loading}
      title={`Loghează-te ca ${userName}`}
      className={
        className ||
        'inline-flex items-center gap-1 text-amber-600 hover:text-amber-800 text-sm font-medium disabled:opacity-50'
      }
    >
      <UserCircleIcon className="w-4 h-4" />
      {loading ? '...' : 'Loghează-te ca'}
    </button>
  )
}
