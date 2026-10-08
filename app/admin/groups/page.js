'use client'

import dynamic from 'next/dynamic'

// Heavy 'use client' page — loaded dynamically so the server shell renders
// immediately and the loading.js skeleton shows while the JS bundle loads.
const GroupsPageClient = dynamic(() => import('./GroupsPageClient'), { ssr: false })

export default function GroupsPage() {
  return <GroupsPageClient />
}

