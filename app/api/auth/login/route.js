/**
 * POST /api/auth/login
 * Unified login with all security features:
 * - Rate limiting (Redis/Upstash with DB fallback)
 * - Adaptive CAPTCHA (Cloudflare Turnstile)
 * - 2FA/TOTP support
 * - Audit logging
 * - Brute force alerts
 */

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/prisma'
import { verifyPassword } from '@/lib/security/argon2'
import { 
  checkRateLimit, 
  recordFailedAttempt, 
  resetRateLimit, 
  applyDelay 
} from '@/lib/security/rate-limit.js'
import { auditLogin } from '@/lib/security/audit.js'
import { alertBruteForce } from '@/lib/security/alerts.js'
import { 
  shouldRequireCaptcha, 
  verifyCaptcha, 
  recordCaptchaFailure, 
  resetCaptchaState 
} from '@/lib/security/captcha.js'
import { getClientIP, getUserAgent } from '@/lib/security/guards.js'

// Get device ID from cookies (simplified version)
async function getDeviceIdFromRequest(request) {
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.match(/device_id=([^;]+)/)
  return match ? match[1] : null
}

export async function POST(request) {
  const ipAddress = await getClientIP()
  const userAgent = await getUserAgent()
  const deviceId = await getDeviceIdFromRequest(request)
  
  try {
    const body = await request.json()
    const { email, password, captchaToken, totpCode } = body
    
    // Basic validation
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email și parola sunt obligatorii' },
        { status: 400 }
      )
    }
    
    const normalizedEmail = email.toLowerCase().trim()
    
    // Check CAPTCHA requirement - but skip if this is a 2FA code submission
    // (CAPTCHA was already verified in the first request)
    const is2FASubmission = !!totpCode
    const needsCaptcha = !is2FASubmission && (
      await shouldRequireCaptcha(normalizedEmail) || 
      await shouldRequireCaptcha(ipAddress)
    )
    
    if (needsCaptcha) {
      if (!captchaToken) {
        console.log('CAPTCHA required but no token provided for:', normalizedEmail)
        return NextResponse.json(
          { 
            error: 'Verificarea CAPTCHA este necesară',
            requiresCaptcha: true,
            siteKey: process.env.TURNSTILE_SITE_KEY
          },
          { status: 400 }
        )
      }
      
      const captchaResult = await verifyCaptcha(captchaToken, ipAddress)
      console.log('CAPTCHA verification result:', captchaResult.success, captchaResult.error || '')
      if (!captchaResult.success) {
        return NextResponse.json(
          { 
            error: 'Verificarea CAPTCHA a eșuat. Încearcă din nou.',
            requiresCaptcha: true,
            siteKey: process.env.TURNSTILE_SITE_KEY
          },
          { status: 400 }
        )
      }
    }
    
    // Check rate limit
    const rateLimit = await checkRateLimit({
      action: 'login',
      identifier: normalizedEmail,
      ip: ipAddress,
      deviceId,
    })
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          error: 'Prea multe încercări. Încercați din nou mai târziu.',
          retryAfter: rateLimit.retryAfter,
          blocked: true
        },
        { status: 429 }
      )
    }
    
    // Apply progressive delay
    if (rateLimit.delay) {
      await applyDelay(rateLimit.delay)
    }
    
    // Find user - IMPORTANT: same timing whether user exists or not
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    })
    
    // Verify password - do this even if user doesn't exist (timing attack prevention)
    const dummyHash = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g'
    const passwordValid = await verifyPassword(
      user?.password || dummyHash, 
      password
    )
    
    // Check various failure conditions
    if (!user || !passwordValid) {
      // Record failed attempt
      await recordFailedAttempt({
        action: 'login',
        identifier: normalizedEmail,
        ip: ipAddress,
        deviceId,
      })
      
      await recordCaptchaFailure(normalizedEmail)
      await recordCaptchaFailure(ipAddress)
      
      // Audit failed login
      await auditLogin({
        userId: user?.id,
        email: normalizedEmail,
        success: false,
        reason: !user ? 'user_not_found' : 'invalid_password',
        ipAddress,
        deviceId,
        userAgent,
      })
      
      // Check if this triggers brute force alert
      if (rateLimit.remaining <= 1) {
        await alertBruteForce({
          email: normalizedEmail,
          ipAddress,
          attempts: 5 - rateLimit.remaining + 1,
        })
      }
      
      // Check new captcha state
      const nowNeedsCaptcha = await shouldRequireCaptcha(normalizedEmail)
      
      return NextResponse.json(
        { 
          error: 'Email sau parolă incorectă',
          requiresCaptcha: nowNeedsCaptcha,
          siteKey: nowNeedsCaptcha ? process.env.TURNSTILE_SITE_KEY : undefined,
          remaining: rateLimit.remaining - 1
        },
        { status: 401 }
      )
    }
    
    // Check if account is active
    if (!user.active) {
      await auditLogin({
        userId: user.id,
        email: normalizedEmail,
        success: false,
        reason: 'account_disabled',
        ipAddress,
        deviceId,
        userAgent,
      })
      
      return NextResponse.json(
        { error: 'Contul este dezactivat. Contactează administratorul.' },
        { status: 403 }
      )
    }
    
    // Check if 2FA is required
    if (user.twoFactorEnabled) {
      if (!totpCode) {
        // Return that 2FA is required
        return NextResponse.json({
          requires2FA: true,
          userId: user.id,
          message: 'Codul 2FA este necesar'
        })
      }
      
      // Verify TOTP code
      const { verifyTOTP, decryptTOTPSecret } = await import('@/lib/security/totp.js')
      
      if (!user.twoFactorSecret) {
        return NextResponse.json(
          { error: '2FA configurat incorect. Contactează administratorul.' },
          { status: 500 }
        )
      }
      
      const decryptedSecret = decryptTOTPSecret(user.twoFactorSecret)
      const isValidTOTP = verifyTOTP(totpCode, decryptedSecret)
      
      if (!isValidTOTP) {
        // Check rate limit for 2FA
        await recordFailedAttempt({
          action: '2fa',
          identifier: normalizedEmail,
          ip: ipAddress,
          deviceId,
        })
        
        await auditLogin({
          userId: user.id,
          email: normalizedEmail,
          success: false,
          reason: 'invalid_2fa_code',
          ipAddress,
          deviceId,
          userAgent,
        })
        
        return NextResponse.json(
          { 
            error: 'Cod 2FA invalid',
            requires2FA: true,
            userId: user.id
          },
          { status: 401 }
        )
      }
    }
    
    // Success! Clear rate limit and CAPTCHA state
    await resetRateLimit({
      action: 'login',
      identifier: normalizedEmail,
      ip: ipAddress,
      deviceId,
    })
    
    await resetCaptchaState(normalizedEmail)
    await resetCaptchaState(ipAddress)
    
    // Audit successful login
    await auditLogin({
      userId: user.id,
      email: normalizedEmail,
      success: true,
      ipAddress,
      deviceId,
      userAgent,
    })
    
    // Token de unică folosință pentru signIn-ul NextAuth: dovada că parola
    // (și 2FA-ul) au trecut aici. Fără el, NextAuth nu deschide sesiunea.
    const loginToken = crypto.randomBytes(32).toString('hex')
    await prisma.stepUpToken.create({
      data: {
        tokenHash: crypto.createHash('sha256').update(loginToken).digest('hex'),
        userId: user.id,
        action: 'login',
        ipAddress,
        deviceId,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      },
    })

    // Return success
    return NextResponse.json({
      success: true,
      loginToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    })
    
  } catch (error) {
    console.error('Login API error:', error)
    
    // Log error but return generic message
    await auditLogin({
      userId: null,
      email: 'unknown',
      success: false,
      reason: `server_error: ${error.message}`,
      ipAddress,
      deviceId,
      userAgent,
    }).catch(() => {}) // Don't fail on audit error
    
    return NextResponse.json(
      { error: 'A apărut o eroare la autentificare' },
      { status: 500 }
    )
  }
}

/**
 * GET - Check login state (CAPTCHA requirement, etc.)
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')
  
  if (!email) {
    return NextResponse.json({ requiresCaptcha: false })
  }
  
  const normalizedEmail = email.toLowerCase().trim()
  const requiresCaptcha = await shouldRequireCaptcha(normalizedEmail)
  
  return NextResponse.json({
    requiresCaptcha,
    siteKey: requiresCaptcha ? process.env.TURNSTILE_SITE_KEY : undefined
  })
}
