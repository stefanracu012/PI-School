'use client'

import dynamic from 'next/dynamic'

// Calculul trece prin toată baza — clientul se încarcă separat, ca pagina
// să apară imediat cu ce are deja în browser.
const StatisticsClient = dynamic(() => import('./StatisticsClient'), { ssr: false })

export default function StatisticsPage() {
  return <StatisticsClient />
}
