import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import TeacherSidebar from '@/components/teacher/TeacherSidebar'
import TeacherHeader from '@/components/teacher/TeacherHeader'
import ImpersonationBanner from '@/components/ImpersonationBanner'

export const metadata = {
  title: 'PI School Profesor',
  description: 'Panou profesor PI School',
  manifest: '/manifest-teacher.json',
  appleWebApp: {
    capable: true,
    title: 'PI School Profesor',
    statusBarStyle: 'default',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'application-name': 'PI School Profesor',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'PI School Profesor',
  },
}

export const viewport = {
  themeColor: '#0c1a1d',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  userScalable: false,
}

export default async function TeacherLayout({ children }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Only allow TEACHER, ADMIN and SUPERADMIN roles
  if (!['SUPERADMIN', 'TEACHER', 'ADMIN'].includes(session.user.role)) {
    redirect('/login')
  }

  return (
    <div
      className="crm-root min-h-screen bg-gray-50"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <ImpersonationBanner />
      <TeacherSidebar />
      <div className="lg:pl-64">
        <TeacherHeader user={session.user} />
        <main
          className="p-3 xs:p-4 sm:p-6 lg:p-8 scrollbar-thin"
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
