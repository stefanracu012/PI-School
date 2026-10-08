'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { ArrowLeftOnRectangleIcon, EyeIcon } from '@heroicons/react/24/outline'

/**
 * Banner sticky afișat când SUPERADMIN-ul impersonează alt cont.
 * Citește starea din session.user.impersonating.
 */
export default function ImpersonationBanner() {
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)

  if (!session?.user?.impersonating) return null

  const handleStop = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/impersonate/stop', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Eroare')
        setLoading(false)
        return
      }
      toast.success('Ai revenit la contul de admin')
      window.location.href = data.redirectTo || '/admin/teachers'
    } catch (e) {
      toast.error('Eroare')
      setLoading(false)
    }
  }

  const roleLabel = session.user.role === 'TEACHER' ? 'Profesor' : 'Admin'

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 max-w-[calc(100vw-2rem)]">
      <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-white border border-amber-300 rounded-full shadow-lg text-xs">
        <EyeIcon className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <span className="text-gray-700 truncate max-w-[180px]">
          Vizualizezi ca <span className="font-semibold text-gray-900">{session.user.name}</span>
          <span className="text-gray-500"> ({roleLabel})</span>
        </span>
      </div>
      <button
        onClick={handleStop}
        disabled={loading}
        title={`Ieși — revino la ${session.user.originalName || 'admin'}`}
        className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-full text-xs font-semibold shadow-lg transition-colors disabled:opacity-60"
      >
        <ArrowLeftOnRectangleIcon className="w-4 h-4" />
        <span>Ieși</span>
      </button>
    </div>
  )
}
