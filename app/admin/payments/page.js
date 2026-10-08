'use client'

import dynamic from 'next/dynamic'

// Heavy 'use client' page (~1500 lines) — loaded dynamically so the server shell
// renders immediately and the loading.js skeleton shows while the JS bundle loads.
const PaymentsPageClient = dynamic(() => import('./PaymentsPageClient'), { ssr: false })

export default function PaymentsPage() {
  return <PaymentsPageClient />
}
