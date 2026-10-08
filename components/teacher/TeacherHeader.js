'use client'

import { signOut } from 'next-auth/react'
import Image from 'next/image'
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import Link from 'next/link'
import NotificationBell from '@/components/NotificationBell'

export default function TeacherHeader({ user }) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 lg:h-16">
          {/* Mobile logo */}
          <Link href="/teacher" className="lg:hidden flex items-center gap-2">
            <Image
              src="/pi.png"
              alt="PI School"
              width={882}
              height={882}
              className="h-9 w-auto rounded-full shrink-0 object-contain"
            />
            <span className="text-lg font-bold text-gray-900">PI SCHOOL</span>
          </Link>

          {/* Desktop - Back button */}
          <div className="hidden lg:block">
            <button 
              onClick={() => window.history.back()} 
              className="text-sm text-gray-500 hover:text-teal-600"
            >
              ← Înapoi
            </button>
          </div>

          {/* Right side - Notifications + User menu */}
          <div className="flex items-center gap-2 xs:gap-3">
            {/* Notification Bell */}
            <NotificationBell isAdmin={false} />

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100"
              >
                {user?.image ? (
                  <Image
                    src={user.image}
                    alt={user.name || 'User'}
                    width={36}
                    height={36}
                    className="rounded-full object-cover"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#30919f] flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">
                      {user?.name?.charAt(0) || 'P'}
                    </span>
                  </div>
                )}
                <span className="hidden sm:block text-sm font-medium text-gray-700">
                  {user?.name || 'Profesor'}
                </span>
              </button>

              {/* Dropdown Menu */}
              {showMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowMenu(false)} 
                />
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="font-medium text-gray-900 truncate">{user?.name}</p>
                    <p className="text-sm text-gray-500 truncate">{user?.email}</p>
                  </div>
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="w-full flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50"
                  >
                    <ArrowRightOnRectangleIcon className="w-5 h-5" />
                    <span>Deconectare</span>
                  </button>
                </div>
              </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
