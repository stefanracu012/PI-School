/**
 * POST /api/admin/export
 * Export data (requires step-up)
 */

import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin, getRequestContext, apiError } from '@/lib/security/guards.js'
import { verifyStepUpToken, SENSITIVE_ACTIONS } from '@/lib/security/step-up.js'
import { createAuditLog, SEVERITY } from '@/lib/security/audit.js'
import { sendSecurityAlert } from '@/lib/security/alerts.js'

export async function POST(request) {
  const context = await getRequestContext()
  
  try {
    const { session, user, error } = await requireAdmin()
    if (error) return error
    
    // Parse body
    const body = await request.json()
    const { type, stepUpToken, filters = {} } = body
    
    // Validate export type
    const validTypes = ['students', 'users', 'audit_logs', 'payments']
    if (!type || !validTypes.includes(type)) {
      return apiError('Invalid export type', 400)
    }
    
    // Require step-up
    const stepUpResult = await verifyStepUpToken({
      token: stepUpToken,
      userId: user.id,
      action: SENSITIVE_ACTIONS.EXPORT,
      ...context,
    })
    
    if (!stepUpResult.valid) {
      await createAuditLog({
        action: 'export_failed',
        actorId: user.id,
        details: {
          type,
          reason: `step_up_failed: ${stepUpResult.reason}`,
        },
        ...context,
        severity: SEVERITY.WARNING,
        success: false,
      })
      
      return apiError('Step-up verification required', 403, 'STEP_UP_REQUIRED')
    }
    
    // Perform export based on type
    let data = []
    let count = 0
    
    switch (type) {
      case 'students':
        data = await prisma.student.findMany({
          include: {
            groupStudents: {
              include: {
                group: true
              }
            }
          }
        })
        count = data.length
        break
        
      case 'users':
        data = await prisma.user.findMany({
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            active: true,
            twoFactorEnabled: true,
            createdAt: true,
            // Exclude sensitive fields
          }
        })
        count = data.length
        break
        
      case 'payments':
        data = await prisma.payment.findMany({
          include: {
            groupStudent: {
              include: {
                student: true,
                group: true,
              }
            }
          }
        })
        count = data.length
        break
        
      case 'audit_logs':
        // Only last 30 days by default
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        
        data = await prisma.auditLog.findMany({
          where: {
            createdAt: { gte: thirtyDaysAgo }
          },
          include: {
            actor: {
              select: { email: true, name: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        })
        count = data.length
        break
    }
    
    // Audit export
    await createAuditLog({
      action: 'export_data',
      actorId: user.id,
      details: {
        type,
        count,
        filters,
        exportedBy: user.email,
      },
      ...context,
      severity: SEVERITY.WARNING, // Exports are always notable
      success: true,
    })
    
    // Alert
    await sendSecurityAlert({
      type: 'data_export',
      severity: 'warning',
      title: 'Data Export',
      message: `${user.email} exported ${count} ${type} records`,
      details: { type, count, filters },
      ipAddress: context.ipAddress,
      userId: user.id,
    })
    
    return NextResponse.json({
      success: true,
      type,
      count,
      data,
      exportedAt: new Date().toISOString(),
      exportedBy: user.email,
    })
    
  } catch (error) {
    console.error('Export error:', error)
    return apiError('Failed to export data', 500)
  }
}
