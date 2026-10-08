'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import {
  ComputerDesktopIcon,
  TrashIcon,
  ClockIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline'
import { ShieldExclamationIcon } from '@heroicons/react/24/solid'

export default function StudentSessionInfo({ studentId, activeSessionId, activeSessionAt, activeSessionIp, activeSessionUA }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const hasSession = !!activeSessionId

  const resetSession = async () => {
    if (!confirm('Resetezi sesiunea activă? Elevul (și oricine folosea contul) va fi aruncat afară.')) return
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/students/${studentId}/session`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Eroare server')
      toast.success('Sesiune resetată — toți utilizatorii au fost scoși')
      router.refresh()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleString('ro-RO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 xs:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className={`p-1.5 rounded-lg ${hasSession ? 'bg-green-50' : 'bg-gray-50'}`}>
          <ShieldExclamationIcon className={`w-5 h-5 ${hasSession ? 'text-green-600' : 'text-gray-400'}`} />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Sesiune activă /learn</h3>
          <p className="text-xs text-gray-500">Single-session enforcement</p>
        </div>
        <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${hasSession ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {hasSession ? 'Activ' : 'Nicio sesiune'}
        </span>
      </div>

      {hasSession ? (
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <ClockIcon className="w-4 h-4 text-gray-400 shrink-0" />
            <span>Ultima activitate: <strong>{formatDate(activeSessionAt)}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <GlobeAltIcon className="w-4 h-4 text-gray-400 shrink-0" />
            <span>IP: <strong className="font-mono">{activeSessionIp || '—'}</strong></span>
          </div>
          <div className="flex items-start gap-2 text-xs text-gray-600">
            <ComputerDesktopIcon className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
            <span className="break-all">{activeSessionUA || '—'}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400 mb-4">
          Elevul nu s-a conectat încă sau sesiunea a fost resetată.
        </p>
      )}

      <button
        onClick={resetSession}
        disabled={loading || !hasSession}
        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        <TrashIcon className="w-4 h-4" />
        {loading ? 'Se resetează...' : 'Resetează sesiunea activ'}
      </button>
    </div>
  )
}
