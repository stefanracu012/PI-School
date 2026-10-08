/**
 * Adaptive CAPTCHA utilities
 * Integrates with Cloudflare Turnstile (recommended) or reCAPTCHA
 */

import prisma from '@/lib/prisma'

// CAPTCHA configuration
const CAPTCHA_CONFIG = {
  provider: process.env.CAPTCHA_PROVIDER || 'turnstile', // 'turnstile' or 'recaptcha'
  secretKey: process.env.TURNSTILE_SECRET_KEY || process.env.RECAPTCHA_SECRET_KEY,
  siteKey: process.env.TURNSTILE_SITE_KEY || process.env.RECAPTCHA_SITE_KEY,
  failureThreshold: parseInt(process.env.CAPTCHA_FAILURE_THRESHOLD) || 3, // Require CAPTCHA after N failures
  resetAfterHours: parseInt(process.env.CAPTCHA_RESET_HOURS) || 24,
}

/**
 * Check if CAPTCHA should be required for an identifier
 * @param {string} identifier - Email or IP address
 * @returns {Promise<boolean>}
 */
export async function shouldRequireCaptcha(identifier) {
  if (CAPTCHA_CONFIG.provider === 'none' || !CAPTCHA_CONFIG.secretKey) {
    // CAPTCHA disabled
    return false
  }
  
  const state = await prisma.captchaState.findUnique({
    where: { key: identifier }
  })
  
  if (!state) return false
  
  // Reset if too old
  if (state.lastFailure) {
    const hoursSinceFailure = (Date.now() - state.lastFailure.getTime()) / (1000 * 60 * 60)
    if (hoursSinceFailure > CAPTCHA_CONFIG.resetAfterHours) {
      await prisma.captchaState.delete({ where: { key: identifier } })
      return false
    }
  }
  
  return state.requiresCaptcha || state.failures >= CAPTCHA_CONFIG.failureThreshold
}

/**
 * Record a failure and possibly enable CAPTCHA requirement
 * @param {string} identifier - Email or IP address
 */
export async function recordCaptchaFailure(identifier) {
  const state = await prisma.captchaState.upsert({
    where: { key: identifier },
    update: {
      failures: { increment: 1 },
      lastFailure: new Date(),
    },
    create: {
      key: identifier,
      failures: 1,
      lastFailure: new Date(),
    }
  })
  
  // Enable CAPTCHA if threshold reached
  if (state.failures >= CAPTCHA_CONFIG.failureThreshold) {
    await prisma.captchaState.update({
      where: { key: identifier },
      data: { requiresCaptcha: true }
    })
  }
}

/**
 * Reset CAPTCHA state after successful action
 * @param {string} identifier - Email or IP address
 */
export async function resetCaptchaState(identifier) {
  await prisma.captchaState.deleteMany({
    where: { key: identifier }
  })
}

/**
 * Verify CAPTCHA token server-side
 * @param {string} token - CAPTCHA response token from client
 * @param {string} [remoteIp] - Client IP address
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function verifyCaptcha(token, remoteIp = null) {
  if (CAPTCHA_CONFIG.provider === 'none' || !CAPTCHA_CONFIG.secretKey) {
    // CAPTCHA disabled, consider it successful
    return { success: true }
  }
  
  if (!token) {
    return { success: false, error: 'CAPTCHA token missing' }
  }
  
  try {
    if (CAPTCHA_CONFIG.provider === 'turnstile') {
      return await verifyTurnstile(token, remoteIp)
    } else {
      return await verifyRecaptcha(token, remoteIp)
    }
  } catch (error) {
    console.error('CAPTCHA verification error:', error)
    return { success: false, error: 'CAPTCHA verification failed' }
  }
}

/**
 * Verify Cloudflare Turnstile
 */
async function verifyTurnstile(token, remoteIp) {
  const formData = new URLSearchParams()
  formData.append('secret', CAPTCHA_CONFIG.secretKey)
  formData.append('response', token)
  if (remoteIp) formData.append('remoteip', remoteIp)
  
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })
  
  const data = await response.json()
  
  if (data.success) {
    return { success: true }
  }
  
  return {
    success: false,
    error: data['error-codes']?.join(', ') || 'Turnstile verification failed',
  }
}

/**
 * Verify Google reCAPTCHA
 */
async function verifyRecaptcha(token, remoteIp) {
  const params = new URLSearchParams()
  params.append('secret', CAPTCHA_CONFIG.secretKey)
  params.append('response', token)
  if (remoteIp) params.append('remoteip', remoteIp)
  
  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    body: params,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })
  
  const data = await response.json()
  
  if (data.success) {
    // For reCAPTCHA v3, also check score
    if (data.score !== undefined && data.score < 0.5) {
      return { success: false, error: 'Low reCAPTCHA score' }
    }
    return { success: true }
  }
  
  return {
    success: false,
    error: data['error-codes']?.join(', ') || 'reCAPTCHA verification failed',
  }
}

/**
 * Get CAPTCHA state for debugging
 */
export async function getCaptchaState(identifier) {
  return prisma.captchaState.findUnique({
    where: { key: identifier }
  })
}

/**
 * Cleanup old CAPTCHA states (for cron job)
 */
export async function cleanupCaptchaStates() {
  const cutoffDate = new Date()
  cutoffDate.setHours(cutoffDate.getHours() - CAPTCHA_CONFIG.resetAfterHours)
  
  const result = await prisma.captchaState.deleteMany({
    where: {
      lastFailure: { lt: cutoffDate }
    }
  })
  
  console.log(`Cleaned up ${result.count} old CAPTCHA states`)
  return result.count
}

/**
 * Get configuration for client-side CAPTCHA
 */
export function getCaptchaConfig() {
  return {
    enabled: !!CAPTCHA_CONFIG.secretKey,
    provider: CAPTCHA_CONFIG.provider,
    siteKey: CAPTCHA_CONFIG.siteKey,
  }
}
