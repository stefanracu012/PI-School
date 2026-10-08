'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  UserGroupIcon,
  ClipboardDocumentCheckIcon,
  ArrowLeftOnRectangleIcon,
  ArrowPathIcon,
  AcademicCapIcon,
  HomeIcon,
  Bars3Icon,
  XMarkIcon,
  BellIcon,
  ShieldCheckIcon,
  ClockIcon,
  InboxIcon,
  BookOpenIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'

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
  {
    name: 'Dashboard',
    href: '/teacher',
    icon: HomeIcon,
    exact: true
  },
  {
    name: 'Notificări',
    href: '/teacher/notifications',
    icon: BellIcon
  },
  {
    name: 'Orar',
    href: '/teacher/orar',
    icon: ClockIcon
  },
  {
    name: 'Grupele Mele',
    href: '/teacher/groups',
    icon: UserGroupIcon
  },
  {
    name: 'Elevii Mei',
    href: '/teacher/students',
    icon: AcademicCapIcon
  },
  {
    name: 'Prezențe',
    href: '/teacher/attendance',
    icon: ClipboardDocumentCheckIcon
  },
  {
    name: 'Lecții neefectuate',
    href: '/teacher/missed-sessions',
    icon: ExclamationTriangleIcon
  },
  {
    name: 'Recuperări',
    href: '/teacher/makeup',
    icon: ArrowPathIcon
  },
  {
    name: 'Securitate',
    href: '/teacher/security',
    icon: ShieldCheckIcon
  }
]

export default function TeacherSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [pendingHref, setPendingHref] = useState(null)

  // Verifică dacă utilizatorul e admin
  const isAdmin = session?.user?.role === 'ADMIN'

  // Handler pentru navigare cu loading state
  const handleNavigation = (href, closeMobile = false) => {
    if (pathname === href) return // Nu naviga dacă suntem deja pe pagină

    setPendingHref(href)
    if (closeMobile) setMobileMenuOpen(false)

    startTransition(() => {
      router.push(href)
    })
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
          {/* Logo Section */}
          <div className="flex items-center h-16 px-6 border-b border-gray-200">
            <Link href="/teacher/groups" className="flex items-center gap-3">
              <Image
                src="/pi.png"
                alt="PI School"
                width={882}
                height={882}
                className="h-9 w-auto rounded-full shrink-0 object-contain"
              />
              <span className="text-lg font-bold text-gray-900">PI SCHOOL</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navigation.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + '/')
              const isLoading = isPending && pendingHref === item.href

              return (
                <button
                  key={item.name}
                  onClick={() => handleNavigation(item.href)}
                  disabled={isLoading}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                    isActive
                      ? 'bg-[#30919f] text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  } ${isLoading ? 'opacity-70' : ''}`}
                >
                  {isLoading ? (
                    <LoadingSpinner className="w-5 h-5" />
                  ) : (
                    <item.icon className="w-5 h-5" />
                  )}
                  <span className="font-medium">{item.name}</span>
                  {isLoading && (
                    <LoadingSpinner className="w-4 h-4 ml-auto" />
                  )}
                </button>
              )
            })}
          </nav>

          {/* User Info */}
          <div className="p-3 border-t border-gray-200">
            <div className="flex items-center gap-3 px-2 py-2">
              {session?.user?.image ? (
                <Image
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-[#30919f] flex items-center justify-center">
                  <span className="text-white font-medium">
                    {session?.user?.name?.charAt(0) || 'P'}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{session?.user?.name || 'Profesor'}</p>
                <p className="text-xs text-gray-500 truncate">{session?.user?.email}</p>
              </div>
            </div>
          </div>

          {/* Back to Admin - doar pentru admini */}
          {isAdmin && (
            <div className="p-3 border-t border-gray-200">
              <Link
                href="/admin"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <ArrowLeftOnRectangleIcon className="w-5 h-5" />
                <span className="font-medium">Panou Admin</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Menu Button - Fixed bottom right (lifted above iOS home bar / Exit button) */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="lg:hidden fixed right-4 z-50 bg-[#30919f] text-white p-3 rounded-full shadow-lg hover:bg-[#247a86] transition-colors"
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
      <div className={`lg:hidden fixed inset-y-0 left-0 w-72 bg-white z-50 transform transition-transform duration-300 ease-in-out ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Header cu close button */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
          <Link
            href="/teacher"
            className="flex items-center gap-3"
            onClick={() => setMobileMenuOpen(false)}
          >
            <Image
              src="/pi.png"
              alt="PI School"
              width={882}
              height={882}
              className="h-9 w-auto rounded-full shrink-0 object-contain"
            />
            <span className="text-lg font-bold text-gray-900">PI SCHOOL</span>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Închide meniul"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + '/')
            const isLoading = isPending && pendingHref === item.href

            return (
              <button
                key={item.name}
                onClick={() => handleNavigation(item.href, true)}
                disabled={isLoading}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-[#30919f] text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                } ${isLoading ? 'opacity-70' : ''}`}
              >
                {isLoading ? (
                  <LoadingSpinner className="w-5 h-5" />
                ) : (
                  <item.icon className="w-5 h-5" />
                )}
                <span className="font-medium">{item.name}</span>
                {isLoading && (
                  <LoadingSpinner className="w-4 h-4 ml-auto" />
                )}
              </button>
            )
          })}
        </nav>

        {/* User Info */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-gray-200 bg-white">
          <div className="flex items-center gap-3 px-2 py-2">
            {session?.user?.image ? (
              <Image
                src={session.user.image}
                alt={session.user.name || 'User'}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-[#30919f] flex items-center justify-center">
                <span className="text-white font-medium">
                  {session?.user?.name?.charAt(0) || 'P'}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{session?.user?.name || 'Profesor'}</p>
              <p className="text-xs text-gray-500 truncate">{session?.user?.email}</p>
            </div>
          </div>

          {/* Back to Admin - doar pentru admini */}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 mt-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <ArrowLeftOnRectangleIcon className="w-5 h-5" />
              <span className="font-medium">Panou Admin</span>
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
