'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  BellIcon, 
  CheckIcon, 
  XMarkIcon,
  BookOpenIcon,
  ArrowTrendingDownIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  BanknotesIcon,
  ClipboardDocumentListIcon,
  XCircleIcon
} from '@heroicons/react/24/outline'
import { BellAlertIcon } from '@heroicons/react/24/solid'
import Link from 'next/link'

const TYPE_CONFIG = {
  TEACHER_DAILY_SCHEDULE: {
    Icon: BookOpenIcon,
    color: 'bg-blue-500',
    iconColor: 'text-blue-600',
    lightColor: 'bg-blue-50 border-blue-200'
  },
  LOW_LESSONS: {
    Icon: ArrowTrendingDownIcon,
    color: 'bg-yellow-500',
    iconColor: 'text-yellow-600',
    lightColor: 'bg-yellow-50 border-yellow-200'
  },
  ZERO_LESSONS: {
    Icon: ExclamationTriangleIcon,
    color: 'bg-orange-500',
    iconColor: 'text-orange-600',
    lightColor: 'bg-orange-50 border-orange-200'
  },
  NEGATIVE_LESSONS: {
    Icon: ExclamationCircleIcon,
    color: 'bg-red-500',
    iconColor: 'text-red-600',
    lightColor: 'bg-red-50 border-red-200'
  },
  PAYMENT_RECEIVED: {
    Icon: BanknotesIcon,
    color: 'bg-green-500',
    iconColor: 'text-green-600',
    lightColor: 'bg-green-50 border-green-200'
  },
  NEW_ENROLLMENT: {
    Icon: ClipboardDocumentListIcon,
    color: 'bg-purple-500',
    iconColor: 'text-purple-600',
    lightColor: 'bg-purple-50 border-purple-200'
  },
  MISSED_SESSION: {
    Icon: XCircleIcon,
    color: 'bg-red-500',
    iconColor: 'text-red-600',
    lightColor: 'bg-red-50 border-red-200'
  },
  CANCELLED_SESSION: {
    Icon: XCircleIcon,
    color: 'bg-orange-500',
    iconColor: 'text-orange-600',
    lightColor: 'bg-orange-50 border-orange-200'
  },
  LATE_SESSION: {
    Icon: ExclamationTriangleIcon,
    color: 'bg-amber-500',
    iconColor: 'text-amber-600',
    lightColor: 'bg-amber-50 border-amber-200'
  },
  REVISION_REQUEST: {
    Icon: ClipboardDocumentListIcon,
    color: 'bg-indigo-500',
    iconColor: 'text-indigo-600',
    lightColor: 'bg-indigo-50 border-indigo-200'
  },
  LEAD_FOLLOWUP: {
    Icon: BellAlertIcon,
    color: 'bg-teal-500',
    iconColor: 'text-teal-600',
    lightColor: 'bg-teal-50 border-teal-200'
  }
}

// Plasă pentru orice tip nou care ajunge în baza de date
const FALLBACK_CONFIG = {
  Icon: BellIcon,
  color: 'bg-gray-500',
  iconColor: 'text-gray-600',
  lightColor: 'bg-gray-50 border-gray-200'
}

export default function NotificationBell({ isAdmin = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const dropdownRef = useRef(null)

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications?limit=10')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount)
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  // Initial fetch and polling every 60 seconds
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60000)
    return () => clearInterval(interval)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Mark notification as read
  const markAsRead = async (notificationId) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: [notificationId] })
      })
      
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true })
      })
      
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  // Format relative time
  const formatRelativeTime = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Acum'
    if (diffMins < 60) return `${diffMins} min`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}z`
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-xl transition-all ${
          isOpen 
            ? 'bg-gray-100 text-gray-900' 
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
        }`}
      >
        {unreadCount > 0 ? (
          <BellAlertIcon className="w-6 h-6 text-[#30919f] animate-pulse" />
        ) : (
          <BellIcon className="w-6 h-6" />
        )}
        
        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-red-500 rounded-full animate-bounce">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="fixed sm:absolute inset-x-2 sm:inset-x-auto sm:right-0 top-16 sm:top-auto sm:mt-2 w-auto sm:w-96 max-w-[calc(100vw-16px)] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-3 sm:px-4 py-3 bg-gradient-to-r from-[#30919f] to-[#136976]">
            <h3 className="font-semibold text-white flex items-center gap-2 text-sm sm:text-base">
              <BellIcon className="w-5 h-5" />
              Notificări
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-xs bg-white/20 rounded-full">
                  {unreadCount} noi
                </span>
              )}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-white/80 hover:text-white flex items-center gap-1 transition-colors"
              >
                <CheckIcon className="w-4 h-4" />
                <span className="hidden xs:inline">Marchează citite</span>
                <span className="xs:hidden">Citite</span>
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-2 border-[#30919f] border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-gray-500 text-sm mt-2">Se încarcă...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <BellIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">Nicio notificare</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const config = TYPE_CONFIG[notification.type] || FALLBACK_CONFIG
                
                return (
                  <div
                    key={notification.id}
                    className={`relative border-b border-gray-100 last:border-0 transition-colors ${
                      !notification.read ? config.lightColor : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    {notification.link ? (
                      <Link
                        href={notification.link}
                        onClick={() => {
                          if (!notification.read) markAsRead(notification.id)
                          setIsOpen(false)
                        }}
                        className="block p-3 sm:p-4"
                      >
                        <NotificationContent 
                          notification={notification} 
                          config={config}
                          formatRelativeTime={formatRelativeTime}
                        />
                      </Link>
                    ) : (
                      <div className="p-3 sm:p-4">
                        <NotificationContent 
                          notification={notification} 
                          config={config}
                          formatRelativeTime={formatRelativeTime}
                        />
                      </div>
                    )}
                    
                    {/* Unread indicator */}
                    {!notification.read && (
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${config.color}`}></div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <Link
              href={isAdmin ? "/admin/notifications" : "/teacher/notifications"}
              onClick={() => setIsOpen(false)}
              className="block px-4 py-3 text-center text-sm font-medium text-[#30919f] hover:bg-gray-50 border-t border-gray-100 transition-colors"
            >
              Vezi toate notificările →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

// Notification content component
function NotificationContent({ notification, config, formatRelativeTime }) {
  const Icon = config.Icon
  return (
    <div className="flex gap-2 sm:gap-3">
      <div className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl ${config.color} flex items-center justify-center`}>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-xs sm:text-sm leading-tight ${!notification.read ? 'text-gray-900' : 'text-gray-700'}`}>
          {notification.title}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 whitespace-pre-line leading-tight">
          {notification.message}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>
    </div>
  )
}
