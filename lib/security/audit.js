/**
 * Audit logging system
 * Append-only audit trail for security events
 */

import prisma from '@/lib/prisma'
import { sendSecurityAlert } from './alerts.js'

// Actions that trigger immediate alerts
const ALERT_ACTIONS = [
  'login_failed_multiple',
  'create_admin',
  'create_teacher',
  'change_role',
  '2fa_disabled',
  '2fa_reset',
  'export_data',
  'delete_user',
  'delete_data',
  'suspicious_activity',
  'step_up_failed_multiple',
]

// Severity levels
export const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
}

/**
 * Create an audit log entry
 * @param {Object} params
 * @param {string} params.action - Action type
 * @param {string} [params.actorId] - User performing the action
 * @param {string} [params.targetId] - Target resource ID
 * @param {string} [params.targetType] - Target type (user, group, etc.)
 * @param {string} [params.ipAddress] - IP address
 * @param {string} [params.deviceId] - Device ID
 * @param {string} [params.userAgent] - User agent string
 * @param {Object} [params.details] - Additional details
 * @param {string} [params.severity] - Severity level
 * @param {boolean} [params.success] - Whether action was successful
 * @returns {Promise<Object>} - Created audit log entry
 */
export async function createAuditLog({
  action,
  actorId = null,
  targetId = null,
  targetType = null,
  ipAddress = null,
  deviceId = null,
  userAgent = null,
  details = null,
  severity = SEVERITY.INFO,
  success = true,
}) {
  try {
    const auditLog = await prisma.auditLog.create({
      data: {
        action,
        actorId,
        targetId,
        targetType,
        ipAddress,
        deviceId,
        userAgent: userAgent ? userAgent.substring(0, 500) : null, // Truncate long user agents
        details,
        severity,
        success,
      }
    })
    
    // Send alert for critical actions
    if (ALERT_ACTIONS.includes(action) || severity === SEVERITY.CRITICAL) {
      await sendSecurityAlert({
        type: action,
        severity,
        title: getAlertTitle(action, success),
        message: getAlertMessage(action, details, success),
        details: {
          ...details,
          actorId,
          targetId,
          targetType,
          ipAddress,
        },
        ipAddress,
        userId: actorId,
      })
    }
    
    return auditLog
  } catch (error) {
    // Log to console if DB write fails - never lose audit data
    console.error('AUDIT LOG WRITE FAILED:', {
      action,
      actorId,
      targetId,
      details,
      error: error.message,
      timestamp: new Date().toISOString(),
    })
    
    // Re-throw to ensure caller knows about failure
    throw error
  }
}

/**
 * Get audit logs with filtering
 */
export async function getAuditLogs({
  action = null,
  actorId = null,
  targetId = null,
  severity = null,
  startDate = null,
  endDate = null,
  limit = 100,
  skip = 0,
}) {
  const where = {}
  
  if (action) where.action = action
  if (actorId) where.actorId = actorId
  if (targetId) where.targetId = targetId
  if (severity) where.severity = severity
  
  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) where.createdAt.gte = new Date(startDate)
    if (endDate) where.createdAt.lte = new Date(endDate)
  }
  
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        actor: {
          select: { id: true, email: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    }),
    prisma.auditLog.count({ where })
  ])
  
  return { logs, total }
}

/**
 * Create login audit log (convenience function)
 */
export async function auditLogin({
  userId,
  email,
  success,
  reason = null,
  ipAddress,
  deviceId,
  userAgent,
}) {
  return createAuditLog({
    action: success ? 'login' : 'login_failed',
    actorId: userId,
    details: {
      email,
      reason,
    },
    ipAddress,
    deviceId,
    userAgent,
    severity: success ? SEVERITY.INFO : SEVERITY.WARNING,
    success,
  })
}

/**
 * Create 2FA audit log
 */
export async function audit2FA({
  action, // 'setup', 'verify', 'backup_used', 'disabled'
  userId,
  success,
  reason = null,
  ipAddress,
  deviceId,
  userAgent,
}) {
  const severity = action === 'disabled' ? SEVERITY.CRITICAL : SEVERITY.INFO
  
  return createAuditLog({
    action: `2fa_${action}`,
    actorId: userId,
    targetId: userId,
    targetType: 'user',
    details: { reason },
    ipAddress,
    deviceId,
    userAgent,
    severity,
    success,
  })
}

/**
 * Create user management audit log
 */
export async function auditUserAction({
  action, // 'create', 'update', 'delete', 'change_role'
  actorId,
  targetUserId,
  details = {},
  ipAddress,
  deviceId,
  userAgent,
  success = true,
}) {
  const severity = ['create', 'delete', 'change_role'].includes(action) 
    ? SEVERITY.CRITICAL 
    : SEVERITY.INFO
    
  const fullAction = action === 'create' 
    ? `create_${details.role?.toLowerCase() || 'user'}` 
    : action === 'change_role' 
    ? 'change_role'
    : `user_${action}`
  
  return createAuditLog({
    action: fullAction,
    actorId,
    targetId: targetUserId,
    targetType: 'user',
    details,
    ipAddress,
    deviceId,
    userAgent,
    severity,
    success,
  })
}

/**
 * Create step-up audit log
 */
export async function auditStepUp({
  action, // 'init', 'verify', 'failed'
  userId,
  intendedAction,
  success,
  ipAddress,
  deviceId,
  userAgent,
}) {
  return createAuditLog({
    action: `step_up_${action}`,
    actorId: userId,
    details: { intendedAction },
    ipAddress,
    deviceId,
    userAgent,
    severity: success ? SEVERITY.INFO : SEVERITY.WARNING,
    success,
  })
}

// Helper functions for alert messages
function getAlertTitle(action, success) {
  const titles = {
    login_failed_multiple: '⚠️ Multiple Failed Login Attempts',
    create_admin: '🔴 New Admin Created',
    create_teacher: '🟡 New Teacher Created',
    change_role: '🔴 User Role Changed',
    '2fa_disabled': '🔴 2FA Disabled',
    '2fa_reset': '🟠 2FA Reset',
    export_data: '📤 Data Export',
    delete_user: '🔴 User Deleted',
    delete_data: '🟠 Data Deleted',
    suspicious_activity: '🚨 Suspicious Activity Detected',
    step_up_failed_multiple: '⚠️ Multiple Step-up Failures',
  }
  return titles[action] || `Security Event: ${action}`
}

function getAlertMessage(action, details, success) {
  switch (action) {
    case 'create_admin':
      return `Admin user "${details?.email || 'unknown'}" was created.`
    case 'create_teacher':
      return `Teacher "${details?.email || 'unknown'}" was created.`
    case 'change_role':
      return `User role changed from ${details?.oldRole} to ${details?.newRole}.`
    case '2fa_disabled':
      return `2FA was disabled for a user. Immediate review recommended.`
    case 'login_failed_multiple':
      return `Multiple failed login attempts detected for ${details?.email || 'unknown'}.`
    default:
      return JSON.stringify(details || {})
  }
}

/**
 * Cleanup old audit logs (optional, for storage management)
 * Default: 21 days, configurable via AUDIT_LOG_RETENTION_DAYS
 */
export async function cleanupOldAuditLogs(retentionDays = null) {
  // Use env variable or default to 21 days
  const days = retentionDays ?? (parseInt(process.env.AUDIT_LOG_RETENTION_DAYS) || 21)
  
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  
  // Delete all logs older than retention period
  // Critical logs are still deleted - use separate archival if needed
  const result = await prisma.auditLog.deleteMany({
    where: {
      createdAt: { lt: cutoffDate }
    }
  })
  
  console.log(`Cleaned up ${result.count} audit logs older than ${days} days`)
  return result.count
}
