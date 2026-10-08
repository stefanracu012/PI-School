'use client'

import dynamic from 'next/dynamic'

// Heavy 'use client' page — loaded dynamically so the server shell renders
// immediately and the loading.js skeleton shows while the JS bundle loads.
const StudentsPageClient = dynamic(() => import('./StudentsPageClient'), { ssr: false })

export default function StudentsPage() {
  return <StudentsPageClient />
}
