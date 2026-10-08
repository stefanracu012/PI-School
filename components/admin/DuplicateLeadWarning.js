'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

/**
 * La un lead nou: există deja cineva cu numele sau telefonul ăsta?
 * Arată și lead-urile, și elevii — un „lead nou" poate fi cineva care deja
 * învață la noi. Nu blochează nimic; decizia rămâne a omului.
 */
export default function DuplicateLeadWarning({ name, phone, excludeId = null }) {
  const [matches, setMatches] = useState([])

  useEffect(() => {
    const n = (name || '').trim()
    const p = (phone || '').trim()
    if (n.length < 3 && p.replace(/\D/g, '').length < 8) {
      setMatches([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams()
        if (n) params.set('name', n)
        if (p) params.set('phone', p)
        if (excludeId) params.set('exclude', excludeId)

        const res = await fetch(`/api/leads/check-duplicate?${params}`)
        if (!res.ok) return
        const json = await res.json()
        setMatches(json.matches || [])
      } catch {
        // verificarea nu trebuie să încurce introducerea
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [name, phone, excludeId])

  if (matches.length === 0) return null

  const strong = matches.some((m) => m.score >= 2)

  return (
    <div className={`rounded-lg border p-3 ${strong ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
      <p className={`text-sm font-medium flex items-center gap-1.5 ${strong ? 'text-amber-800' : 'text-gray-700'}`}>
        <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
        {strong ? 'Persoana pare să existe deja' : 'Seamănă cu cineva din CRM'}
      </p>

      <ul className="mt-2 space-y-1.5">
        {matches.map((m) => (
          <li key={`${m.kind}-${m.id}`} className="text-xs flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              m.kind === 'student' ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'
            }`}>
              {m.kind === 'student' ? 'elev' : 'lead'}
            </span>
            <Link
              href={m.kind === 'student' ? `/admin/students/${m.id}` : `/admin/leads/${m.id}`}
              target="_blank"
              className="font-medium text-indigo-700 hover:underline"
            >
              {m.name}
            </Link>
            <span className="text-gray-500">
              {m.studentName && m.studentName !== m.name ? `elev: ${m.studentName} · ` : ''}
              {m.phone || 'fără telefon'}
              {m.status ? ` · ${m.status}` : ''}
              {m.assignedTo ? ` · ${m.assignedTo}` : ''}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
              m.score >= 2 ? 'bg-amber-200 text-amber-900' : 'bg-gray-200 text-gray-600'
            }`}>
              {m.reason}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[11px] text-gray-500">
        Poți salva oricum — verifică doar să nu fie aceeași persoană.
      </p>
    </div>
  )
}
