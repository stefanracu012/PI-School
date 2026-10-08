'use client'

import { signOut } from 'next-auth/react'
import Image from 'next/image'
import { useState, useEffect, useRef } from 'react'
import NotificationBell from '@/components/NotificationBell'
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'

export default function AdminHeader({ user }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    signOut({ callbackUrl: '/login' })
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 xs:h-16 shrink-0 items-center gap-x-2 xs:gap-x-4 border-b border-gray-200 bg-white px-3 xs:px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      <div className="flex flex-1 gap-x-2 xs:gap-x-4 self-stretch lg:gap-x-6">
        {/* Back button */}
        <div className="flex flex-1 items-center">
          <button 
            onClick={() => window.history.back()} 
            className="text-xs xs:text-sm text-gray-500 hover:text-indigo-600 truncate"
          >
            <span className="hidden xs:inline">← Înapoi</span>
            <span className="xs:hidden">←</span>
          </button>
        </div>

        {/* User menu */}
        <div className="flex items-center gap-x-2 xs:gap-x-4 lg:gap-x-6">
          {/* Notifications */}
          <NotificationBell isAdmin={true} />

          {/* Separator */}
          <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200" aria-hidden="true" />

          {/* Direct Logout Button - always visible */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs xs:text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            title="Deconectare"
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4 xs:w-5 xs:h-5" />
            <span className="hidden sm:inline">Ieșire</span>
          </button>

          {/* Profile dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="flex items-center gap-x-2 xs:gap-x-3"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <span className="sr-only">Open user menu</span>
              {user?.image ? (
                <Image
                  src={user.image}
                  alt={user.name || 'User'}
                  width={32}
                  height={32}
                  className="h-7 w-7 xs:h-8 xs:w-8 rounded-full object-cover"
                />
              ) : (
                <div className="h-7 w-7 xs:h-8 xs:w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <span className="text-white text-xs xs:text-sm font-medium">
                    {user?.name?.charAt(0) || user?.email?.charAt(0) || 'A'}
                  </span>
                </div>
              )}
              <span className="hidden lg:flex lg:items-center">
                <span className="text-sm font-medium text-gray-900" aria-hidden="true">
                  {user?.name || user?.email}
                </span>
                <svg className="ml-2 h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </span>
            </button>

            {/* Dropdown menu */}
            {isMenuOpen && (
              <div className="absolute right-0 z-10 mt-2 w-56 xs:w-64 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
                <div className="px-3 xs:px-4 py-2 border-b">
                  <p className="text-xs xs:text-sm text-gray-900 font-medium truncate">{user?.name}</p>
                  <p className="text-[10px] xs:text-xs text-gray-500 truncate">{user?.email}</p>
                  <p className="text-[10px] xs:text-xs text-indigo-600 font-medium mt-1">{user?.role}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="block w-full px-3 xs:px-4 py-2 text-left text-xs xs:text-sm text-red-600 hover:bg-red-50 font-medium"
                >
                  🚪 Deconectare
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
