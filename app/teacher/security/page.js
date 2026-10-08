'use client'

import TelegramConnect from '@/components/TelegramConnect'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'

export default function TeacherSecurityPage() {
  const { data: session, update: updateSession } = useSession()
  const [loading, setLoading] = useState(true)
  const [user2FAStatus, setUser2FAStatus] = useState(null)
  const [setupMode, setSetupMode] = useState(false)
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [backupCodes, setBackupCodes] = useState([])

  // Fetch 2FA status
  useEffect(() => {
    async function fetch2FAStatus() {
      try {
        const res = await fetch('/api/admin/security/2fa/status')
        if (res.ok) {
          const data = await res.json()
          setUser2FAStatus(data)
        }
      } catch (error) {
        console.error('Error fetching 2FA status:', error)
      } finally {
        setLoading(false)
      }
    }
    fetch2FAStatus()
  }, [])

  // Initialize 2FA setup
  const initSetup = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/security/2fa/setup', {
        method: 'POST'
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Eroare la inițializarea 2FA')
      }
      
      const data = await res.json()
      setQrCode(data.qrCode)
      setSecret(data.secret)
      setSetupMode(true)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  // Verify and enable 2FA
  const verifyAndEnable = async (e) => {
    e.preventDefault()
    
    if (verifyCode.length !== 6) {
      toast.error('Codul trebuie să aibă 6 cifre')
      return
    }
    
    setVerifying(true)
    try {
      const res = await fetch('/api/admin/security/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode })
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Cod invalid')
      }
      
      // Show backup codes
      setBackupCodes(data.backupCodes || [])
      setUser2FAStatus({ ...user2FAStatus, enabled: true })
      setSetupMode(false)
      // Actualizăm sesiunea pentru a reflecta activarea 2FA în toată aplicația
      await updateSession()
      toast.success('2FA activat cu succes!')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setVerifying(false)
    }
  }

  // Disable 2FA
  const disable2FA = async () => {
    if (!confirm('Ești sigur că vrei să dezactivezi 2FA? Contul tău va fi mai puțin securizat.')) {
      return
    }
    
    setLoading(true)
    try {
      const res = await fetch('/api/admin/security/2fa/disable', {
        method: 'POST'
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Eroare la dezactivarea 2FA')
      }
      
      setUser2FAStatus({ ...user2FAStatus, enabled: false })
      // Actualizăm sesiunea pentru a reflecta dezactivarea 2FA în toată aplicația
      await updateSession()
      toast.success('2FA dezactivat')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  // Copy backup codes
  const copyBackupCodes = () => {
    const text = backupCodes.join('\n')
    navigator.clipboard.writeText(text)
    toast.success('Coduri copiate în clipboard')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Securitate</h1>
        <p className="text-gray-600 mt-1">Gestionează setările de securitate ale contului tău</p>
      </div>

      {/* Backup Codes Modal */}
      {backupCodes.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900">2FA Activat!</h3>
              <p className="text-gray-600 mt-2">
                Salvează aceste coduri de backup într-un loc sigur. Le poți folosi dacă pierzi accesul la aplicația de autentificare.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code, i) => (
                  <code key={i} className="text-sm font-mono text-gray-800 bg-white px-3 py-2 rounded border">
                    {code}
                  </code>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={copyBackupCodes}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
              >
                📋 Copiază
              </button>
              <button
                onClick={() => setBackupCodes([])}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
              >
                Am salvat codurile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2FA Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                user2FAStatus?.enabled ? 'bg-green-100' : user2FAStatus?.canEnable2FA ? 'bg-yellow-100' : 'bg-gray-100'
              }`}>
                <svg className={`w-6 h-6 ${user2FAStatus?.enabled ? 'text-green-600' : user2FAStatus?.canEnable2FA ? 'text-yellow-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Autentificare în doi pași (2FA)</h2>
                <p className="text-sm text-gray-600">
                  {user2FAStatus?.enabled 
                    ? 'Protecție suplimentară activă pentru contul tău'
                    : user2FAStatus?.canEnable2FA 
                      ? 'Adaugă un nivel suplimentar de securitate la contul tău'
                      : 'Contactează administratorul pentru activare'}
                </p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              user2FAStatus?.enabled 
                ? 'bg-green-100 text-green-700' 
                : user2FAStatus?.canEnable2FA 
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-gray-100 text-gray-500'
            }`}>
              {user2FAStatus?.enabled ? 'Activ' : user2FAStatus?.canEnable2FA ? 'Inactiv' : 'Indisponibil'}
            </span>
          </div>
        </div>

        <div className="p-6">
          {!setupMode ? (
            <>
              {user2FAStatus?.enabled ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
                    <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span className="text-green-700">
                      Contul tău este protejat cu autentificare în doi pași
                    </span>
                  </div>
                  
                  <button
                    onClick={disable2FA}
                    disabled={loading}
                    className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 font-medium disabled:opacity-50"
                  >
                    Dezactivează 2FA
                  </button>
                </div>
              ) : user2FAStatus?.canEnable2FA ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-xl">
                    <svg className="w-5 h-5 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-yellow-700">
                      Recomandăm activarea 2FA pentru securitate maximă
                    </span>
                  </div>

                  <div className="prose prose-sm text-gray-600">
                    <p>Cu 2FA activat, vei avea nevoie de:</p>
                    <ul className="mt-2 space-y-1">
                      <li>Parola ta</li>
                      <li>Un cod generat de aplicația Google Authenticator (sau similară)</li>
                    </ul>
                  </div>

                  <button
                    onClick={initSetup}
                    disabled={loading}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold disabled:opacity-50 flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Activează 2FA
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                    <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-gray-600">
                      Autentificarea în doi pași nu este activată pentru contul tău. Contactează un administrator dacă dorești să activezi această funcție.
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Setup Mode */
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Configurare 2FA</h3>
                <p className="text-gray-600">Scanează codul QR cu aplicația Google Authenticator</p>
              </div>

              {/* QR Code */}
              <div className="flex justify-center">
                <div className="p-4 bg-white rounded-xl border-2 border-gray-200">
                  {qrCode && (
                    <img src={qrCode} alt="QR Code pentru 2FA" className="w-48 h-48" />
                  )}
                </div>
              </div>

              {/* Manual entry */}
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-2">Sau introdu manual acest cod:</p>
                <code className="px-4 py-2 bg-gray-100 rounded-lg text-sm font-mono select-all">
                  {secret}
                </code>
              </div>

              {/* Verify */}
              <form onSubmit={verifyAndEnable} className="max-w-xs mx-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Introdu codul din aplicație
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full px-4 py-3 text-center text-2xl tracking-widest font-mono border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    autoComplete="one-time-code"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSetupMode(false)
                      setQrCode('')
                      setSecret('')
                      setVerifyCode('')
                    }}
                    className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium"
                  >
                    Anulează
                  </button>
                  <button
                    type="submit"
                    disabled={verifying || verifyCode.length !== 6}
                    className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold disabled:opacity-50"
                  >
                    {verifying ? 'Se verifică...' : 'Activează'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Telegram */}
      <div className="mt-6">
        <TelegramConnect />
      </div>
      {/* Account Info */}
      <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Informații cont</h2>
        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">Email</span>
            <span className="font-medium text-gray-900">{session?.user?.email}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">Nume</span>
            <span className="font-medium text-gray-900">{session?.user?.name || '-'}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-gray-600">Rol</span>
            <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium">
              Profesor
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
