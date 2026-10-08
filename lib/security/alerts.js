/**
 * Security alerting system
 * Sends notifications via Telegram and/or Email
 */

import prisma from '@/lib/prisma'

// Telegram config for security alerts
const TELEGRAM_SECURITY_BOT_TOKEN = process.env.TELEGRAM_SECURITY_BOT_TOKEN || process.env.TELEGRAM_LESSONS_BOT_TOKEN
const TELEGRAM_SECURITY_CHAT_ID = process.env.TELEGRAM_SECURITY_CHAT_ID || process.env.TELEGRAM_LESSONS_CHAT_ID
// Topic dedicat în grupul cu topic-uri; dacă lipsește, alertele merg în „General".
const TELEGRAM_SECURITY_THREAD_ID = process.env.TELEGRAM_SECURITY_THREAD_ID

/**
 * Send a security alert
 * @param {Object} params
 * @param {string} params.type - Alert type
 * @param {string} params.severity - 'warning' or 'critical'
 * @param {string} params.title - Alert title
 * @param {string} params.message - Alert message
 * @param {Object} [params.details] - Additional details
 * @param {string} [params.ipAddress] - IP address
 * @param {string} [params.userId] - Related user ID
 */
export async function sendSecurityAlert({
  type,
  severity = 'warning',
  title,
  message,
  details = null,
  ipAddress = null,
  userId = null,
}) {
  const sentVia = []
  
  try {
    // Send Telegram notification
    if (TELEGRAM_SECURITY_BOT_TOKEN && TELEGRAM_SECURITY_CHAT_ID) {
      const telegramSent = await sendTelegramSecurityAlert({
        title,
        message,
        severity,
        details,
        ipAddress,
      })
      if (telegramSent) sentVia.push('telegram')
    }
    
    // TODO: Add email alerting here if needed
    // if (process.env.SMTP_HOST) {
    //   await sendEmailSecurityAlert({ ... })
    //   sentVia.push('email')
    // }
    
    // Store alert in database
    await prisma.securityAlert.create({
      data: {
        type,
        severity,
        title,
        message,
        details,
        ipAddress,
        userId,
        sentVia,
      }
    })
    
  } catch (error) {
    console.error('Failed to send security alert:', error)
    // Still try to save to DB
    try {
      await prisma.securityAlert.create({
        data: {
          type,
          severity,
          title,
          message: `${message} [Alert send failed: ${error.message}]`,
          details,
          ipAddress,
          userId,
          sentVia,
        }
      })
    } catch (dbError) {
      console.error('Failed to save security alert to DB:', dbError)
    }
  }
}

/**
 * Send Telegram security alert
 */
async function sendTelegramSecurityAlert({ title, message, severity, details, ipAddress }) {
  try {
    const severityEmoji = severity === 'critical' ? '🚨' : '⚠️'
    const timestamp = new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' })
    
    let text = `${severityEmoji} <b>${escapeHtml(title)}</b>\n\n`
    text += `${escapeHtml(message)}\n\n`
    text += `🕐 ${timestamp}\n`
    
    if (ipAddress) {
      text += `🌐 IP: <code>${escapeHtml(ipAddress)}</code>\n`
    }
    
    if (details && typeof details === 'object') {
      const safeDetails = Object.entries(details)
        .filter(([key]) => !['password', 'token', 'secret'].includes(key.toLowerCase()))
        .map(([key, value]) => `• ${key}: ${escapeHtml(String(value))}`)
        .join('\n')
      
      if (safeDetails) {
        text += `\n📋 Detalii:\n${safeDetails}`
      }
    }
    
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_SECURITY_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_SECURITY_CHAT_ID,
          text,
          parse_mode: 'HTML',
          ...(TELEGRAM_SECURITY_THREAD_ID
            ? { message_thread_id: parseInt(TELEGRAM_SECURITY_THREAD_ID) }
            : {}),
        }),
      }
    )
    
    const data = await response.json()
    return data.ok
  } catch (error) {
    console.error('Telegram security alert failed:', error)
    return false
  }
}

/**
 * Escape HTML for Telegram
 */
function escapeHtml(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Alert for brute force detection
 */
export async function alertBruteForce({ email, ipAddress, attempts }) {
  await sendSecurityAlert({
    type: 'brute_force',
    severity: 'critical',
    title: 'Brute Force Attack Detected',
    message: `Multiple failed login attempts (${attempts}) detected.`,
    details: { email, attempts },
    ipAddress,
  })
}

/**
 * Alert for suspicious login
 */
export async function alertSuspiciousLogin({ userId, email, reason, ipAddress }) {
  await sendSecurityAlert({
    type: 'suspicious_login',
    severity: 'warning',
    title: 'Suspicious Login Detected',
    message: reason,
    details: { email },
    ipAddress,
    userId,
  })
}

/**
 * Alert for admin/teacher creation
 */
export async function alertUserCreated({ actorEmail, newUserEmail, role, ipAddress, actorId }) {
  await sendSecurityAlert({
    type: role === 'ADMIN' ? 'admin_created' : 'teacher_created',
    severity: 'critical',
    title: role === 'ADMIN' ? 'New Admin Created' : 'New Teacher Created',
    message: `${actorEmail} created a new ${role.toLowerCase()}: ${newUserEmail}`,
    details: { actorEmail, newUserEmail, role },
    ipAddress,
    userId: actorId,
  })
}

/**
 * Get recent security alerts
 */
export async function getSecurityAlerts({
  type = null,
  severity = null,
  acknowledged = null,
  limit = 50,
  skip = 0,
}) {
  const where = {}
  
  if (type) where.type = type
  if (severity) where.severity = severity
  if (acknowledged !== null) where.acknowledged = acknowledged
  
  const [alerts, total] = await Promise.all([
    prisma.securityAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    }),
    prisma.securityAlert.count({ where })
  ])
  
  return { alerts, total }
}

/**
 * Acknowledge a security alert
 */
export async function acknowledgeAlert(alertId, acknowledgedById) {
  return prisma.securityAlert.update({
    where: { id: alertId },
    data: {
      acknowledged: true,
      acknowledgedBy: acknowledgedById,
      acknowledgedAt: new Date(),
    }
  })
}
