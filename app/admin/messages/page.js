'use client'

import dynamic from 'next/dynamic'

const MessagesClient = dynamic(() => import('./MessagesClient'), { ssr: false })

export default function MessagesPage() {
  return <MessagesClient />
}
