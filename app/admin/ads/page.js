'use client'

import dynamic from 'next/dynamic'

// Pagina cere date lente de la Meta — încărcăm clientul separat, ca shell-ul
// să apară imediat.
const AdsClient = dynamic(() => import('./AdsClient'), { ssr: false })

export default function AdsPage() {
  return <AdsClient />
}
