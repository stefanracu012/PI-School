import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import AdminSidebar from '@/components/admin/AdminSidebar'
import AdminHeader from '@/components/admin/AdminHeader'
import ImpersonationBanner from '@/components/ImpersonationBanner'

export const metadata = {
  title: 'PI School Admin',
  description: 'Panou de administrare PI School',
  manifest: '/manifest-admin.json',
  appleWebApp: {
    capable: true,
    title: 'PI School Admin',
    statusBarStyle: 'default',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'application-name': 'PI School Admin',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'PI School Admin',
  },
}

export const viewport = {
  themeColor: '#0c1a1d',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  userScalable: false,
}

export default async function AdminLayout({ children }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  if (!['SUPERADMIN', 'ADMIN'].includes(session.user.role)) {
    // Dacă SUPERADMIN-ul impersonează un TEACHER și ajunge la /admin, redirecționăm la /teacher
    redirect('/teacher')
  }

  return (
    <div
      className="crm-root min-h-screen bg-gray-100"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <ImpersonationBanner />
      <AdminSidebar user={session.user} />
      <div className="lg:pl-72">
        <AdminHeader user={session.user} />
        <main
          className="py-4 xs:py-5 sm:py-6 px-3 xs:px-4 sm:px-6 lg:px-8 scrollbar-thin text-gray-900"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px), 0.75rem)',
            paddingRight: 'max(env(safe-area-inset-right, 0px), 0.75rem)',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
