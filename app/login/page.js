'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import Image from 'next/image'
import Script from 'next/script'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/admin'
  const error = searchParams.get('error')
  const reason = searchParams.get('reason')

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [totpCode, setTotpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [requiresCaptcha, setRequiresCaptcha] = useState(false)
  const [requires2FA, setRequires2FA] = useState(false)
  const [siteKey, setSiteKey] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [turnstileLoaded, setTurnstileLoaded] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [retryAfter, setRetryAfter] = useState(0)
  const [logoutReason, setLogoutReason] = useState(null)
  const turnstileRef = useRef(null)
  const turnstileWidgetId = useRef(null)
  const totpInputRef = useRef(null)

  // Check for logout reason
  useEffect(() => {
    if (reason === '2fa_failed') {
      setLogoutReason('Sesiunea a fost închisă automat din cauza prea multor încercări 2FA eșuate.')
    }
  }, [reason])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  // Reset Turnstile widget
  const resetTurnstile = () => {
    if (window.turnstile && turnstileWidgetId.current) {
      window.turnstile.reset(turnstileWidgetId.current)
      setCaptchaToken('')
    }
  }

  // Countdown for blocked state
  useEffect(() => {
    if (retryAfter > 0) {
      const timer = setInterval(() => {
        setRetryAfter(prev => {
          if (prev <= 1) {
            setBlocked(false)
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [retryAfter])

  // Focus TOTP input when 2FA is required
  useEffect(() => {
    if (requires2FA && totpInputRef.current) {
      totpInputRef.current.focus()
    }
  }, [requires2FA])

  // Render Turnstile widget
  useEffect(() => {
    if (requiresCaptcha && siteKey && turnstileLoaded && turnstileRef.current) {
      // Clear existing widget if any
      if (turnstileWidgetId.current) {
        window.turnstile.remove(turnstileWidgetId.current)
      }
      
      // Render new widget
      turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
        sitekey: siteKey,
        callback: (token) => {
          setCaptchaToken(token)
        },
        'error-callback': () => {
          toast.error('Eroare la încărcarea CAPTCHA')
        },
        'expired-callback': () => {
          setCaptchaToken('')
          toast.error('CAPTCHA a expirat. Te rog reîncearcă.')
        },
        theme: 'light',
        language: 'ro'
      })
    }
    
    return () => {
      if (window.turnstile && turnstileWidgetId.current) {
        window.turnstile.remove(turnstileWidgetId.current)
        turnstileWidgetId.current = null
      }
    }
  }, [requiresCaptcha, siteKey, turnstileLoaded])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (blocked) {
      toast.error(`Așteaptă ${retryAfter} secunde înainte de a încerca din nou`)
      return
    }
    
    setLoading(true)

    try {
      // Validate credentials with our custom API (includes rate limiting, captcha, 2FA)
      const validateRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          captchaToken: captchaToken || undefined,
          totpCode: requires2FA ? totpCode : undefined
        })
      })

      const validateData = await validateRes.json()

      // Handle rate limit block
      if (validateData.blocked || validateRes.status === 429) {
        setBlocked(true)
        setRetryAfter(validateData.retryAfter || 30)
        toast.error(validateData.error || 'Prea multe încercări')
        return
      }

      // Handle CAPTCHA requirement - always reset widget when server asks for CAPTCHA
      if (validateData.requiresCaptcha) {
        setRequiresCaptcha(true)
        setSiteKey(validateData.siteKey)
        // Reset widget to get a fresh token
        resetTurnstile()
        
        // If this is just a CAPTCHA request (not other error), show appropriate message
        if (validateRes.status === 400 && validateData.error?.includes('CAPTCHA')) {
          toast.error('Completează verificarea CAPTCHA')
          return
        }
      }

      // Handle 2FA requirement
      if (validateData.requires2FA && !totpCode) {
        setRequires2FA(true)
        toast('Introdu codul din aplicația de autentificare', { icon: '🔐' })
        return
      }

      if (!validateRes.ok) {
        toast.error(validateData.error || 'Eroare la autentificare')
        
        // Reset states on error
        if (validateData.requires2FA) {
          setTotpCode('')
        }
        resetTurnstile()
        return
      }

      // Credentials validated (including 2FA if enabled)! Now use NextAuth signIn
      // with the one-time token issued by /api/auth/login
      console.log('Calling NextAuth signIn...')
      const { signIn } = await import('next-auth/react')
      const result = await signIn('credentials', {
        email: formData.email,
        loginToken: validateData.loginToken,
        redirect: false
      })
      
      console.log('NextAuth signIn result:', JSON.stringify(result))

      if (result?.error) {
        console.error('NextAuth signIn error:', result.error)
        toast.error(result.error)
        resetTurnstile()
      } else if (result?.ok || result?.status === 200) {
        toast.success('Autentificare reușită! Redirecționare...')
        console.log('Login successful, redirecting to:', callbackUrl)
        // Small delay to ensure session is saved before redirect
        setTimeout(() => {
          window.location.href = callbackUrl
        }, 500)
      } else {
        console.error('Unexpected signIn result:', result)
        toast.error('Eroare la autentificare')
        resetTurnstile()
      }
    } catch (error) {
      console.error('Login error:', error)
      toast.error('A apărut o eroare la autentificare')
      resetTurnstile()
    } finally {
      setLoading(false)
    }
  }

  // Go back from 2FA to credentials
  const handleBack = () => {
    setRequires2FA(false)
    setTotpCode('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-3 xs:px-4 py-6">
      {/* Load Turnstile script */}
      <Script 
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        onLoad={() => setTurnstileLoaded(true)}
        strategy="lazyOnload"
      />
      
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center mb-5 xs:mb-8">
          <Image
            src="/pi.png"
            alt="PI School"
            width={882}
            height={882}
            className="h-12 xs:h-16 w-auto rounded-full object-contain"
            priority
          />
          <span className="ml-3 text-2xl xs:text-3xl font-bold text-gray-900">PI SCHOOL</span>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl xs:rounded-2xl shadow-xl p-5 xs:p-8">
          <h1 className="text-xl xs:text-2xl font-bold text-gray-900 text-center mb-1.5 xs:mb-2">
            {requires2FA ? 'Verificare 2FA' : 'Bine ai venit!'}
          </h1>
          <p className="text-gray-600 text-center mb-5 xs:mb-8 text-sm xs:text-base">
            {requires2FA 
              ? 'Introdu codul din aplicația de autentificare' 
              : 'Autentifică-te pentru a accesa panoul'}
          </p>

          {error && (
            <div className="mb-4 xs:mb-6 p-3 xs:p-4 bg-red-50 border border-red-200 rounded-lg xs:rounded-xl text-red-600 text-xs xs:text-sm">
              {error === 'OAuthAccountNotLinked' 
                ? 'Email-ul nu are permisiuni. Contactează administratorul.'
                : error === 'AccessDenied'
                ? 'Accesul a fost refuzat.'
                : 'A apărut o eroare la autentificare.'}
            </div>
          )}

          {/* 2FA logout warning */}
          {logoutReason && (
            <div className="mb-4 xs:mb-6 p-3 xs:p-4 bg-amber-50 border border-amber-200 rounded-lg xs:rounded-xl text-amber-700 text-xs xs:text-sm">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <span>{logoutReason}</span>
              </div>
            </div>
          )}

          {/* Blocked warning */}
          {blocked && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs xs:text-sm">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>
                  Prea multe încercări. Așteaptă <strong>{retryAfter}s</strong>
                </span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 xs:space-y-5">
            {!requires2FA ? (
              <>
                <div>
                  <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    disabled={loading}
                    className="w-full px-3 xs:px-4 py-2.5 xs:py-3 border border-gray-300 rounded-lg xs:rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 text-sm xs:text-base disabled:bg-gray-100"
                    placeholder="email@exemplu.com"
                  />
                </div>

                <div>
                  <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                    Parolă
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    disabled={loading}
                    className="w-full px-3 xs:px-4 py-2.5 xs:py-3 border border-gray-300 rounded-lg xs:rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 text-sm xs:text-base disabled:bg-gray-100"
                    placeholder="••••••••"
                  />
                </div>

                {/* Turnstile CAPTCHA */}
                {requiresCaptcha && (
                  <div className="flex flex-col items-center space-y-2">
                    <p className="text-xs text-gray-500">
                      Te rugăm să confirmi că nu ești un robot
                    </p>
                    <div ref={turnstileRef} className="flex justify-center"></div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* 2FA Code Input */}
                <div>
                  <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                    Cod 2FA
                  </label>
                  <input
                    ref={totpInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    required
                    disabled={loading}
                    autoComplete="one-time-code"
                    className="w-full px-3 xs:px-4 py-2.5 xs:py-3 border border-gray-300 rounded-lg xs:rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 text-sm xs:text-base text-center tracking-widest font-mono text-lg disabled:bg-gray-100"
                    placeholder="000000"
                  />
                  <p className="mt-2 text-xs text-gray-500 text-center">
                    Introdu codul din Google Authenticator sau altă aplicație TOTP
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleBack}
                  className="w-full text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Înapoi la autentificare
                </button>
              </>
            )}

            <button
              type="submit"
              disabled={loading || blocked || (requiresCaptcha && !captchaToken && !requires2FA) || (requires2FA && totpCode.length !== 6)}
              className="w-full px-4 py-2.5 xs:py-3 bg-indigo-600 text-white rounded-lg xs:rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm xs:text-base"
            >
              {loading ? 'Se autentifică...' : requires2FA ? 'Verifică codul' : 'Autentificare'}
            </button>
          </form>

          <p className="mt-4 xs:mt-6 text-center text-xs xs:text-sm text-gray-400">
            PI School · CRM intern
          </p>
        </div>
      </div>
    </div>
  )
}
