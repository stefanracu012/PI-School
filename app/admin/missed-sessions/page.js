'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { 
  ExclamationTriangleIcon, 
  CheckCircleIcon,
  TrashIcon,
  CalendarDaysIcon,
  ClockIcon,
  UserIcon,
  AcademicCapIcon
} from '@heroicons/react/24/outline'
import { usePermissions } from '@/hooks/usePermissions'

export default function MissedSessionsPage() {
  const router = useRouter()
  const { hasPermission, isSuperAdmin } = usePermissions()
  
  const [missedSessions, setMissedSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, unacknowledged, acknowledged
  
  // Verifică permisiunea
  useEffect(() => {
    if (!hasPermission('missed-sessions.view') && !isSuperAdmin) {
      router.push('/admin')
    }
  }, [hasPermission, isSuperAdmin, router])

  useEffect(() => {
    fetchMissedSessions()
  }, [filter])

  const fetchMissedSessions = async () => {
    try {
      let url = '/api/admin/missed-sessions'
      if (filter !== 'all') {
        url += `?acknowledged=${filter === 'acknowledged'}`
      }
      
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setMissedSessions(data)
      }
    } catch (error) {
      console.error('Error fetching missed sessions:', error)
      toast.error('Eroare la încărcarea sesiunilor ratate')
    } finally {
      setLoading(false)
    }
  }

  const handleAcknowledge = async (id, acknowledged) => {
    try {
      const res = await fetch('/api/admin/missed-sessions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, acknowledged })
      })

      if (res.ok) {
        toast.success(acknowledged ? 'Marcat ca verificat' : 'Marcat ca neverificat')
        fetchMissedSessions()
      }
    } catch (error) {
      toast.error('Eroare la actualizare')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Sigur vrei să ștergi această înregistrare?')) return

    try {
      const res = await fetch(`/api/admin/missed-sessions?id=${id}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        toast.success('Înregistrare ștearsă')
        fetchMissedSessions()
      }
    } catch (error) {
      toast.error('Eroare la ștergere')
    }
  }

  const handleDeleteAll = async () => {
    const count = missedSessions.length
    const filterLabel = filter === 'all' ? 'toate' : filter === 'unacknowledged' ? 'toate cele neverificate' : 'toate cele verificate'
    if (!confirm(`Sigur vrei să ștergi ${filterLabel} (${count} înregistrări)? Această acțiune nu poate fi anulată!`)) return

    try {
      let url = '/api/admin/missed-sessions?deleteAll=true'
      if (filter !== 'all') {
        url += `&acknowledged=${filter === 'acknowledged'}`
      }

      const res = await fetch(url, { method: 'DELETE' })
      if (res.ok) {
        const data = await res.json()
        toast.success(`${data.count} înregistrări șterse`)
        fetchMissedSessions()
      } else {
        toast.error('Eroare la ștergere')
      }
    } catch (error) {
      toast.error('Eroare la ștergere')
    }
  }

  const unacknowledgedCount = missedSessions.filter(s => !s.acknowledged).length

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
            <ExclamationTriangleIcon className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500" />
            Lecții Ratate
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Lecțiile care nu au fost pornite conform programului
          </p>
        </div>
        
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {unacknowledgedCount > 0 && (
            <div className="px-3 py-1.5 sm:px-4 sm:py-2 bg-red-100 text-red-700 rounded-lg font-medium text-sm sm:text-base">
              {unacknowledgedCount} neverificate
            </div>
          )}
          {missedSessions.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm sm:text-base transition-colors"
            >
              <TrashIcon className="w-4 h-4" />
              Șterge Toate ({missedSessions.length})
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
            filter === 'all' 
              ? 'bg-gray-900 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Toate
        </button>
        <button
          onClick={() => setFilter('unacknowledged')}
          className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
            filter === 'unacknowledged' 
              ? 'bg-red-600 text-white' 
              : 'bg-red-50 text-red-700 hover:bg-red-100'
          }`}
        >
          Neverificate
        </button>
        <button
          onClick={() => setFilter('acknowledged')}
          className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
            filter === 'acknowledged' 
              ? 'bg-green-600 text-white' 
              : 'bg-green-50 text-green-700 hover:bg-green-100'
          }`}
        >
          Verificate
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-8 sm:py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-500 text-sm sm:text-base">Se încarcă...</p>
        </div>
      ) : missedSessions.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-6 sm:p-12 text-center">
          <CheckCircleIcon className="w-12 h-12 sm:w-16 sm:h-16 text-green-500 mx-auto mb-3 sm:mb-4" />
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
            {filter === 'unacknowledged' ? 'Nu sunt lecții neverificate' : 'Nu sunt lecții ratate'}
          </h2>
          <p className="text-gray-500 mt-2 text-sm sm:text-base">
            {filter === 'all' 
              ? 'Toți profesorii și-au respectat programul!' 
              : filter === 'unacknowledged'
                ? 'Toate lecțiile ratate au fost verificate'
                : 'Nu ai verificat încă nicio lecție ratată'}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {missedSessions.map((session) => (
              <div 
                key={session.id}
                className={`bg-white rounded-xl shadow-sm p-3 sm:p-4 ${!session.acknowledged ? 'border-l-4 border-red-500' : ''}`}
              >
                {/* Top row: Status + Actions */}
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  {session.acknowledged ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                      <CheckCircleIcon className="w-3.5 h-3.5" />
                      Verificat
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                      <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                      Nou
                    </span>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleAcknowledge(session.id, !session.acknowledged)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        session.acknowledged 
                          ? 'text-amber-600 hover:bg-amber-50' 
                          : 'text-green-600 hover:bg-green-50'
                      }`}
                    >
                      <CheckCircleIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(session.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Group Info */}
                <Link href={`/admin/groups/${session.groupId}`}>
                  <div className="flex items-start gap-2 mb-2">
                    <AcademicCapIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm sm:text-base truncate">{session.group?.name}</p>
                      <p className="text-xs text-gray-500 truncate">{session.group?.course?.title}</p>
                    </div>
                  </div>
                </Link>

                {/* Teacher + Date Row */}
                <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <UserIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 flex-shrink-0" />
                    <span className="truncate">{session.group?.teacher?.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <CalendarDaysIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 flex-shrink-0" />
                    <span className="truncate">
                      {new Date(session.scheduledDate).toLocaleDateString('ro-RO', {
                        day: 'numeric',
                        month: 'short'
                      })} {session.scheduledTime}
                    </span>
                  </div>
                </div>

                {/* Reason */}
                {session.reason && (
                  <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
                    {session.reason}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Grupă</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Profesor</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Data Programată</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Motiv</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-gray-500">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {missedSessions.map((session) => (
                  <tr 
                    key={session.id} 
                    className={`hover:bg-gray-50 ${!session.acknowledged ? 'bg-red-50' : ''}`}
                  >
                    <td className="px-6 py-4">
                      {session.acknowledged ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          <CheckCircleIcon className="w-4 h-4" />
                          Verificat
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                          <ExclamationTriangleIcon className="w-4 h-4" />
                          Nou
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Link 
                        href={`/admin/groups/${session.groupId}`}
                        className="hover:text-teal-600"
                      >
                        <div className="flex items-center gap-2">
                          <AcademicCapIcon className="w-5 h-5 text-gray-400" />
                          <div>
                            <p className="font-medium text-gray-900">{session.group?.name}</p>
                            <p className="text-xs text-gray-500">{session.group?.course?.title}</p>
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <UserIcon className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900">{session.group?.teacher?.name}</p>
                          <p className="text-xs text-gray-500">{session.group?.teacher?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <CalendarDaysIcon className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900">
                            {new Date(session.scheduledDate).toLocaleDateString('ro-RO', {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </p>
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <ClockIcon className="w-3 h-3" />
                            {session.scheduledTime}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {session.reason || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleAcknowledge(session.id, !session.acknowledged)}
                          className={`p-2 rounded-lg transition-colors ${
                            session.acknowledged 
                              ? 'text-amber-600 hover:bg-amber-50' 
                              : 'text-green-600 hover:bg-green-50'
                          }`}
                          title={session.acknowledged ? 'Marchează ca neverificat' : 'Marchează ca verificat'}
                        >
                          <CheckCircleIcon className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(session.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Șterge"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 sm:p-4">
        <h3 className="font-semibold text-blue-800 mb-1.5 sm:mb-2 text-sm sm:text-base">ℹ️ Cum funcționează?</h3>
        <ul className="text-xs sm:text-sm text-blue-700 space-y-0.5 sm:space-y-1">
          <li>• Profesorii pot porni lecția cu 30 min înainte și până la 23:59</li>
          <li>• Dacă ziua trece, lecția e marcată ca ratată</li>
          <li>• Adminii pot porni lecții oricând</li>
          <li>• Lecțiile ratate NU scad din pachet</li>
        </ul>
      </div>
    </div>
  )
}
