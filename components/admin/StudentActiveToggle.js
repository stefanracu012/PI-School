'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid'

export default function StudentActiveToggle({ studentId, initialValue }) {
  const [active, setActive] = useState(initialValue)
  const router = useRouter()

  const toggle = async () => {
    const next = !active
    if (!next && !confirm('Sigur vrei să dezactivezi contul? Elevul nu va mai putea accesa /learn.')) return
    setActive(next)
    try {
      const res = await fetch(`/api/admin/students/${studentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Eroare')
      }
      toast.success(next ? 'Cont activat' : 'Cont dezactivat')
      router.refresh()
    } catch (e) {
      setActive(!next)
      toast.error(e.message)
    }
  }

  return (
    <button
      onClick={toggle}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition shadow-sm ${
        active
          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 ring-1 ring-emerald-300'
          : 'bg-rose-100 text-rose-700 hover:bg-rose-200 ring-1 ring-rose-300'
      }`}
    >
      {active
        ? <><CheckCircleIcon className="w-4 h-4" /> Cont activ</>
        : <><XCircleIcon className="w-4 h-4" /> Cont dezactivat</>
      }
    </button>
  )
}
