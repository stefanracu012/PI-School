'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

/**
 * Avertizare, nu oprire: arată elevii care seamănă cu cel pe cale să fie creat.
 *
 * Decizia rămâne a omului — sunt destule cazuri reale de doi frați cu același
 * nume de familie, sau chiar doi omonimi. Rostul e doar să nu adaugi al treilea
 * „Popescu Maria" fără să știi că primii doi există deja.
 */
export default function DuplicateStudentWarning({ name, phone, excludeId = null }) {
  const [result, setResult] = useState(null)

  useEffect(() => {
    const cleanName = (name || '').trim()
    const cleanPhone = (phone || '').trim()

    if (cleanName.length < 3 && cleanPhone.length < 6) {
      setResult(null)
      return
    }

    // Așteptăm să se oprească din scris, ca să nu interogăm la fiecare literă
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams()
        if (cleanName) params.set('name', cleanName)
        if (cleanPhone) params.set('phone', cleanPhone)

        const res = await fetch(`/api/students/check-duplicate?${params}`)
        if (!res.ok) return
        const json = await res.json()

        const matches = (json.matches || []).filter((m) => m.id !== excludeId)
        setResult(matches.length > 0 ? { ...json, matches } : null)
      } catch {
        // O verificare eșuată nu trebuie să încurce introducerea elevului
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [name, phone, excludeId])

  if (!result) return null

  const strong = result.matches.some((m) => m.score >= 2)

  return (
    <div className={`sm:col-span-2 rounded-lg border p-3 ${
      strong ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'
    }`}>
      <p className={`text-sm font-medium flex items-center gap-1.5 ${
        strong ? 'text-amber-800' : 'text-gray-700'
      }`}>
        <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
        {strong
          ? 'Există deja un elev cu acest nume'
          : `${result.matches.length} ${result.matches.length === 1 ? 'elev seamănă' : 'elevi seamănă'} cu acesta`}
      </p>

      <ul className="mt-2 space-y-1.5">
        {result.matches.map((m) => (
          <li key={m.id} className="text-xs flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link
              href={`/admin/students/${m.id}`}
              target="_blank"
              className="font-medium text-indigo-700 hover:underline"
            >
              {m.fullName}
            </Link>
            <span className="text-gray-500">
              {m.isAdult ? 'adult' : m.age ? `${m.age} ani` : 'vârstă nespecificată'}
              {m.parentPhone ? ` · ${m.parentPhone}` : ''}
              {m.groups.length > 0 ? ` · ${m.groups.join(', ')}` : ' · fără grupă'}
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
        Poți continua oricum — verifică doar să nu fie aceeași persoană.
      </p>
    </div>
  )
}
