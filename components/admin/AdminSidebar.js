'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { usePermissions } from '@/hooks/usePermissions'

// Spinner component for loading state
function LoadingSpinner({ className = "w-5 h-5" }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: 'home' },
  { name: 'Statistică', href: '/admin/statistics', icon: 'chart', permission: 'statistics.view' },
  { name: 'Notificări', href: '/admin/notifications', icon: 'bell', permission: 'notifications.view' },
  { name: 'Orar', href: '/admin/orar', icon: 'clock', permission: 'schedule.view' },
  { name: 'Leads', href: '/admin/leads', icon: 'chat', permission: 'leads.view' },
  { name: 'Elevi', href: '/admin/students', icon: 'academic', permission: 'students.view' },
  { name: 'Personal', href: '/admin/teachers', icon: 'user', permission: 'teachers.view' },
  { name: 'Grupe', href: '/admin/groups', icon: 'collection', permission: 'groups.view' },
  { name: 'Filiale', href: '/admin/branches', icon: 'building', permission: 'branches.view' },
  { name: 'Sesiuni', href: '/admin/sessions', icon: 'calendar', permission: 'sessions.view' },
  { name: 'Lecții Ratate', href: '/admin/missed-sessions', icon: 'warning', permission: 'missed-sessions.view' },
  { name: 'Recuperări', href: '/admin/makeup', icon: 'refresh', permission: 'makeup.view' },
  { name: 'Plăți', href: '/admin/payments', icon: 'banknotes', permission: 'payments.view' },
  { name: 'Salarii', href: '/admin/salaries', icon: 'banknotes', anyPermission: ['salaries.view', 'salaries.edit', 'salaries.delete'] },
  { name: 'Mesaje', href: '/admin/messages', icon: 'chat', permission: 'messages.view' },
  { name: 'Reclame', href: '/admin/ads', icon: 'megaphone', permission: 'ads.view' },
  // Site-ul public PI School
  { name: 'Cursuri (site)', href: '/admin/courses', icon: 'book', permission: 'courses.view' },
  { name: 'Recenzii (site)', href: '/admin/reviews', icon: 'star', permission: 'reviews.view' },
  { name: 'Înscrieri vechi', href: '/admin/enrollments', icon: 'clipboard', permission: 'inscrieri.view' },
  { name: 'Contact vechi', href: '/admin/contact', icon: 'document', permission: 'contact.view' },
  { name: 'Securitate', href: '/admin/security', icon: 'shield', permission: 'security.manage' },
  { name: 'Alerte Securitate', href: '/admin/security-alerts', icon: 'exclamation', permission: 'security.view' },
  { name: 'Audit Logs', href: '/admin/audit-logs', icon: 'document', permission: 'audit.view' }
]

const icons = {
  home: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  clock: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  bell: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  book: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  users: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  academic: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M12 14l9-5-9-5-9 5 9 5z" />
      <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
    </svg>
  ),
  user: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  collection: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  star: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  refresh: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  banknotes: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    </svg>
  ),
  calendar: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  chart: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  clipboard: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  megaphone: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    </svg>
  ),
  chat: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  shield: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  building: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  exclamation: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  document: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  puzzle: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 10.879a3 3 0 10-4.242 4.242M9 8V5a2 2 0 012-2h2a2 2 0 012 2v3m4 4h-3m4 0a2 2 0 012 2v2a2 2 0 01-2 2h-3m-8-8H5a2 2 0 00-2 2v2a2 2 0 002 2h3m0-8v8m8 0v3a2 2 0 01-2 2h-2a2 2 0 01-2-2v-3" />
    </svg>
  )
}

export default function AdminSidebar({ user }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingHref, setPendingHref] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { hasPermission, isSuperAdmin } = usePermissions()

  // SUPERADMIN vede tot - verificăm și din prop-ul user (server-side) și din hook (client-side)
  const userIsSuperAdmin = user?.role === 'SUPERADMIN' || isSuperAdmin

  // Filtrează navigația în funcție de permisiuni
  const filteredNavigation = navigation.filter(item => {
    // SUPERADMIN vede tot
    if (userIsSuperAdmin) return true
    // Oricare din mai multe permisiuni deschide pagina
    if (item.anyPermission) return item.anyPermission.some((p) => hasPermission(p))
    // Dashboard e vizibil pentru toți
    if (!item.permission && !item.superadminOnly) return true
    // Itemele superadminOnly sunt vizibile doar pentru SUPERADMIN
    if (item.superadminOnly) return false
    // Verifică permisiunea
    return hasPermission(item.permission)
  })

  // Handler pentru navigare cu loading state
  const handleNavigation = (href, closeMobile = false) => {
    if (pathname === href) {
      if (closeMobile) setMobileMenuOpen(false)
      return // Nu naviga dacă suntem deja pe pagină
    }

    setPendingHref(href)
    if (closeMobile) setMobileMenuOpen(false)

    startTransition(() => {
      router.push(href)
    })
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col bg-white border-r border-gray-200">
        {/* Logo — fixed height, never shrinks */}
        <div className="flex h-16 shrink-0 items-center px-6 border-b border-gray-100">
          <Link href="/admin" className="flex items-center gap-3">
            <Image
              src="/pi.png"
              alt="PI School"
              width={882}
              height={882}
              className="h-9 w-auto rounded-full shrink-0 object-contain"
              priority
            />
            <span className="text-lg font-bold text-gray-900">PI SCHOOL</span>
          </Link>
        </div>

        {/* Navigation — fills remaining space and scrolls */}
        <nav className="flex-1 overflow-y-auto scrollbar-sidebar px-4 py-3">
          <ul role="list" className="space-y-1">
            {filteredNavigation.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/admin' && item.href !== '/admin/security' && pathname.startsWith(item.href))
              const isLoading = isPending && pendingHref === item.href

              return (
                <li key={item.name}>
                  <button
                    onClick={() => handleNavigation(item.href)}
                    disabled={isLoading}
                    className={`
                      w-full group flex gap-x-3 rounded-lg p-3 text-sm font-medium leading-6 transition-all
                      ${isActive
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'text-gray-700 hover:text-indigo-600 hover:bg-gray-50'
                      }
                      ${isLoading ? 'opacity-70' : ''}
                    `}
                  >
                    <span className={isActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-indigo-600'}>
                      {isLoading ? <LoadingSpinner className="w-5 h-5" /> : icons[item.icon]}
                    </span>
                    {item.name}
                    {isLoading && (
                      <LoadingSpinner className="w-4 h-4 ml-auto" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* User Info — fixed at bottom, never shrinks */}
        <div className="shrink-0 border-t border-gray-200 px-4 py-3">
          <div className="flex items-center gap-x-4 text-sm font-medium text-gray-900">
            {user?.image ? (
              <Image
                src={user.image}
                alt={user.name || 'User'}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                <span className="text-white font-medium">
                  {user?.name?.charAt(0) || user?.email?.charAt(0) || 'A'}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="truncate">{user?.name || 'Admin'}</p>
              <p className="text-xs text-gray-500 truncate">{user?.role}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu Button - Fixed bottom right (lifted above iOS home bar / Exit button) */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="lg:hidden fixed right-4 z-50 bg-indigo-600 text-white p-3 rounded-full shadow-lg hover:bg-indigo-700 transition-colors"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
        aria-label="Deschide meniul"
      >
        <Bars3Icon className="h-6 w-6" />
      </button>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <div className={`lg:hidden fixed inset-y-0 left-0 w-[280px] max-w-[calc(100vw-40px)] bg-white z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Header cu close button */}
        <div className="flex items-center justify-between h-14 px-3 border-b border-gray-200 shrink-0">
          <Link
            href="/admin"
            className="flex items-center gap-2"
            onClick={() => setMobileMenuOpen(false)}
          >
            <Image
              src="/pi.png"
              alt="PI School"
              width={882}
              height={882}
              className="h-8 w-auto rounded-full shrink-0 object-contain"
            />
            <span className="text-base font-bold text-gray-900">PI SCHOOL</span>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Închide meniul"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto scrollbar-sidebar">
          {filteredNavigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/admin' && item.href !== '/admin/security' && pathname.startsWith(item.href))
            const isLoading = isPending && pendingHref === item.href

            return (
              <button
                key={item.name}
                onClick={() => handleNavigation(item.href, true)}
                disabled={isLoading}
                className={`
                  w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-left
                  ${isActive
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-gray-700 hover:bg-gray-100'
                  }
                  ${isLoading ? 'opacity-70' : ''}
                `}
              >
                <span className={`flex-shrink-0 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`}>
                  {isLoading ? <LoadingSpinner className="w-4 h-4" /> : icons[item.icon]}
                </span>
                <span className="font-medium text-[13px] truncate">{item.name}</span>
                {isLoading && (
                  <LoadingSpinner className="w-3.5 h-3.5 ml-auto flex-shrink-0" />
                )}
              </button>
            )
          })}
        </nav>

        {/* User Info */}
        <div className="shrink-0 p-2.5 border-t border-gray-200 bg-white">
          <div className="flex items-center gap-2 px-1.5 py-1.5">
            {user?.image ? (
              <Image
                src={user.image}
                alt={user.name || 'User'}
                width={36}
                height={36}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {user?.name?.charAt(0) || user?.email?.charAt(0) || 'A'}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">{user?.name || 'Admin'}</p>
              <p className="text-[10px] text-gray-500 truncate">{user?.role}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
