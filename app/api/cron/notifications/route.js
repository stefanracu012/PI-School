import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { NOT_COMPLETED } from '@/lib/group-filters'
import { notifyMissedGroupSession, notifyMissedMakeup, notifyGroupLessonsLow, notifyLowLessons, notifyTeacherDailySchedule } from '@/lib/telegram'

import { cleanupExpiredSessions } from '@/lib/security/session.js'
import { cleanupExpiredStepUpTokens } from '@/lib/security/step-up.js'
import { cleanupExpiredBuckets } from '@/lib/security/rate-limit.js'
import { cleanupCaptchaStates } from '@/lib/security/captcha.js'
import { cleanupOldAuditLogs } from '@/lib/security/audit.js'

const MONTH_NAMES_RO = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

// Map day index to Romanian day names (as stored in database)
const DAY_MAP = {
  0: 'Duminică',
  1: 'Luni', 
  2: 'Marți',
  3: 'Miercuri',
  4: 'Joi',
  5: 'Vineri',
  6: 'Sâmbătă'
}

// Helper function to extract time for a specific day from scheduleTime
function getTimeForDay(scheduleTime, dayName) {
  if (!scheduleTime) return 'Neprecizat'
  
  // If it's JSON format like {"Luni":"10:00","Miercuri":"14:00"}
  if (scheduleTime.startsWith('{')) {
    try {
      const times = JSON.parse(scheduleTime)
      return times[dayName] || times.default || 'Neprecizat'
    } catch {
      return scheduleTime
    }
  }
  
  // Simple time format like "10:00"
  return scheduleTime
}

export async function GET(request) {
  try {
    // Verify cron secret (pentru Vercel Cron)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // Allow local development
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const today = new Date()
    const dayOfWeek = DAY_MAP[today.getDay()]
    const notificationsCreated = []

    // ============================================
    // 1. TEACHER DAILY SCHEDULE NOTIFICATIONS
    // ============================================
    
    // Find all groups that have lessons today
    const groupsWithLessonsToday = await prisma.group.findMany({
      where: {
        active: true,
        ...NOT_COMPLETED,
        scheduleDays: { has: dayOfWeek }
      },
      include: {
        teacher: true,
        groupStudents: {
          where: { status: 'ACTIVE' },
          select: { id: true }
        }
      }
    })

    // Group lessons by teacher
    const teacherLessons = {}
    for (const group of groupsWithLessonsToday) {
      if (!teacherLessons[group.teacherId]) {
        teacherLessons[group.teacherId] = {
          teacher: group.teacher,
          lessons: []
        }
      }
      teacherLessons[group.teacherId].lessons.push({
        groupName: group.name,
        levelName: group.level,
        time: getTimeForDay(group.scheduleTime, dayOfWeek),
        studentsCount: group.groupStudents.length
      })
    }

    // Create notifications for teachers
    for (const [teacherId, data] of Object.entries(teacherLessons)) {
      const lessonsText = data.lessons
        .map(l => `• ${l.time} - ${l.groupName} (${l.studentsCount} elevi)`)
        .join('\n')

      // Check if notification already exists for today
      const startOfDay = new Date(today.setHours(0, 0, 0, 0))
      const endOfDay = new Date(today.setHours(23, 59, 59, 999))
      
      const existingNotification = await prisma.notification.findFirst({
        where: {
          recipientId: teacherId,
          type: 'TEACHER_DAILY_SCHEDULE',
          createdAt: {
            gte: startOfDay,
            lte: endOfDay
          }
        }
      })

      if (!existingNotification) {
        await prisma.notification.create({
          data: {
            type: 'TEACHER_DAILY_SCHEDULE',
            title: `📚 Ai ${data.lessons.length} ${data.lessons.length === 1 ? 'lecție' : 'lecții'} azi`,
            message: lessonsText,
            link: '/teacher/groups',
            recipientId: teacherId,
            data: { lessons: data.lessons }
          }
        })
        notificationsCreated.push(`Teacher schedule: ${data.teacher.name}`)
        
        // Send direct Telegram message to teacher if they have telegramChatId
        if (data.teacher.telegramChatId) {
          await notifyTeacherDailySchedule(
            data.teacher.telegramChatId,
            data.teacher.name,
            data.lessons,
            dayOfWeek
          )
          notificationsCreated.push(`Telegram direct: ${data.teacher.name}`)
        }
      }
    }

    // ============================================
    // 3. MISSED GROUP LESSONS (from yesterday)
    // ============================================
    
    // Get yesterday's date and day of week
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayDayOfWeek = DAY_MAP[yesterday.getDay()]
    
    const startOfYesterday = new Date(yesterday)
    startOfYesterday.setHours(0, 0, 0, 0)
    const endOfYesterday = new Date(yesterday)
    endOfYesterday.setHours(23, 59, 59, 999)

    // Find groups that should have had a lesson yesterday
    const groupsWithLessonsYesterday = await prisma.group.findMany({
      where: {
        active: true,
        ...NOT_COMPLETED,
        scheduleDays: { has: yesterdayDayOfWeek }
      },
      include: {
        teacher: true,
        groupStudents: {
          where: { status: 'ACTIVE' },
          select: { id: true }
        },
        lessonSessions: {
          where: {
            date: {
              gte: startOfYesterday,
              lte: endOfYesterday
            },
            lessonsDeducted: true
          }
        },
        missedSessions: {
          where: {
            scheduledDate: {
              gte: startOfYesterday,
              lte: endOfYesterday
            }
          }
        }
      }
    })

    // Check which groups didn't have a session with deducted lessons
    for (const group of groupsWithLessonsYesterday) {
      // Skip if group has no active students
      if (group.groupStudents.length === 0) continue
      
      // Check if lesson was properly conducted (session exists with lessons deducted)
      const hadSession = group.lessonSessions.length > 0
      const hasMissedSession = group.missedSessions.length > 0
      
      if (!hadSession && !hasMissedSession) {
        // Creează MissedSession în baza de date
        const scheduledTime = getTimeForDay(group.scheduleTime, yesterdayDayOfWeek)
        const [hours, minutes] = scheduledTime.split(':').map(Number)
        const scheduledDate = new Date(yesterday)
        scheduledDate.setHours(hours || 0, minutes || 0, 0, 0)
        
        const missedSession = await prisma.missedSession.create({
          data: {
            groupId: group.id,
            scheduledDate,
            scheduledDay: yesterdayDayOfWeek,
            scheduledTime,
            reason: 'Profesorul nu a pornit lecția'
          }
        })
        
        // Check if notification already exists
        const existingNotification = await prisma.notification.findFirst({
          where: {
            type: 'MISSED_SESSION',
            groupId: group.id,
            createdAt: {
              gte: startOfYesterday
            }
          }
        })

        if (!existingNotification) {
          await prisma.notification.create({
            data: {
              type: 'MISSED_SESSION',
              title: `❌ Lecție neefectuată: ${group.name}`,
              message: `Profesorul ${group.teacher.name} nu a înregistrat lecția pentru grupa "${group.name}" (${group.level}) programată ieri (${yesterdayDayOfWeek}) la ora ${scheduledTime}. Verificați situația.`,
              link: `/admin/groups/${group.id}`,
              recipientId: null, // For all admins
              groupId: group.id,
              data: {
                teacherName: group.teacher.name,
                teacherId: group.teacherId,
                groupName: group.name,
                levelName: group.level,
                scheduledDay: yesterdayDayOfWeek,
                scheduledTime: scheduledTime,
                studentsAffected: group.groupStudents.length
              }
            }
          })
          
          // Trimite și pe Telegram (cu butoane interactive)
          await notifyMissedGroupSession(
            group.name,
            group.teacher.name,
            group.level,
            yesterdayDayOfWeek,
            scheduledTime,
            group.groupStudents.length,
            missedSession.id,
            group.teacher?.telegramChatId || null
          )
          
          notificationsCreated.push(`Missed group session: ${group.name} (${group.teacher.name}) — ${group.teacher?.telegramChatId ? 'mesaj privat trimis' : 'profesorul nu are Telegram conectat'}`)
        }
      }
    }

    // ============================================
    // 4. MISSED MAKEUP LESSONS (from yesterday)
    // ============================================
    
    // Find makeup lessons scheduled for yesterday that weren't completed
    // Include both SCHEDULED (not started) and IN_PROGRESS (started but not finished)
    const missedMakeupLessons = await prisma.makeupLesson.findMany({
      where: {
        scheduledAt: {
          gte: startOfYesterday,
          lte: endOfYesterday
        },
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] }, // Not completed or canceled
        lessonsDeducted: false
      },
      include: {
        teacher: true,
        group: {
          include: {
          }
        },
        students: {
          include: {
            student: { select: { fullName: true } }
          }
        }
      }
    })

    for (const makeup of missedMakeupLessons) {
      // Check if notification already exists for this makeup
      // Note: MongoDB doesn't support JSON path queries, so we check by groupId, type, date
      // and then filter in code
      const possibleNotifications = await prisma.notification.findMany({
        where: {
          type: 'MISSED_SESSION',
          groupId: makeup.groupId,
          createdAt: {
            gte: startOfYesterday
          }
        }
      })
      
      // Filter to find notification with this specific makeupId
      const existingNotification = possibleNotifications.find(n => 
        n.data && n.data.makeupId === makeup.id
      )

      if (!existingNotification) {
        const studentNames = makeup.students.map(s => s.student.fullName).join(', ')
        const scheduledTime = new Date(makeup.scheduledAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' })
        const statusText = makeup.status === 'IN_PROGRESS' ? 'a pornit dar nu a finalizat' : 'nu a pornit'
        
        await prisma.notification.create({
          data: {
            type: 'MISSED_SESSION',
            title: `❌ Recuperare neefectuată`,
            message: `Profesorul ${makeup.teacher.name} ${statusText} lecția de recuperare pentru grupa "${makeup.group.name}" programată ieri la ${scheduledTime}.\n\nElevi: ${studentNames || 'Nespecificați'}`,
            link: `/admin/makeup`,
            recipientId: null, // For all admins
            groupId: makeup.groupId,
            data: {
              makeupId: makeup.id,
              teacherName: makeup.teacher.name,
              teacherId: makeup.teacherId,
              groupName: makeup.group.name,
              levelName: makeup.group.level,
              scheduledTime,
              studentNames,
              status: makeup.status
            }
          }
        })
        
        // Trimite și pe Telegram
        await notifyMissedMakeup(
          makeup.group.name,
          makeup.teacher.name,
          scheduledTime,
          studentNames,
          makeup.teacher?.telegramChatId || null
        )
        
        notificationsCreated.push(`Missed makeup: ${makeup.group.name} (${makeup.teacher.name})`)
      }
    }

    // ============================================
    // 5. LECȚII RĂMASE DIN PACHETUL LUNAR (per grupă)
    // ============================================
    // Socoteala e per grupă: din cele N lecții ale lunii, câte s-au ținut.
    // Absențele individuale nu contează — lecția s-a ținut pentru toți.

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const monthLabel = `${MONTH_NAMES_RO[today.getMonth()]} ${today.getFullYear()}`

    const activeGroups = await prisma.group.findMany({
      where: { active: true, ...NOT_COMPLETED },
      include: {
        teacher: { select: { name: true } },
        groupStudents: {
          where: { status: 'ACTIVE' },
          include: {
            student: { select: { fullName: true, parentName: true, parentPhone: true, parentEmail: true } },
            payments: {
              where: {
        OR: [
          { forYear: today.getFullYear(), forMonth: today.getMonth() + 1 },
          {
            AND: [
              { forMonth: null },
              { paymentDate: { gte: monthStart, lt: monthEnd } },
            ],
          },
        ],
      },
              select: { id: true },
            },
          },
        },
        lessonSessions: {
          where: { date: { gte: monthStart, lt: monthEnd } },
          select: { id: true },
        },
        lessonPackages: {
          where: { year: today.getFullYear(), month: today.getMonth() + 1 },
          select: { totalLessons: true },
        },
      },
    })

    for (const group of activeGroups) {
      if (group.groupStudents.length === 0) continue

      // Grupele plătite individual: alerta e per elev, pe pachetul lui
      if (group.billingType === 'INDIVIDUAL') {
        for (const gs of group.groupStudents) {
          const lessons = gs.lessonsRemaining ?? 0
          if (lessons > 1) continue

          const type = lessons < 0 ? 'NEGATIVE_LESSONS' : lessons === 0 ? 'ZERO_LESSONS' : 'LOW_LESSONS'

          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
          const existing = await prisma.notification.findFirst({
            where: {
              type,
              studentId: gs.studentId,
              groupId: group.id,
              createdAt: { gte: oneDayAgo },
            },
          })
          if (existing) continue

          await prisma.notification.create({
            data: {
              type,
              title: lessons <= 0
                ? `⚠️ ${gs.student.fullName} a rămas fără lecții`
                : `📉 ${gs.student.fullName} mai are 1 lecție`,
              message: `Grupa "${group.name}" — plată per lecție. Lecții rămase: ${lessons}.`,
              link: `/admin/students/${gs.studentId}`,
              recipientId: null,
              studentId: gs.studentId,
              groupId: group.id,
              data: { lessonsRemaining: lessons },
            },
          })

          await notifyLowLessons(
            gs.student.fullName,
            group.name,
            group.level,
            lessons,
            {
              parentName: gs.student.parentName,
              parentPhone: gs.student.parentPhone,
              parentEmail: gs.student.parentEmail,
            }
          )

          notificationsCreated.push(`Per lecție ${gs.student.fullName}: ${lessons} lecții`)
        }
        continue
      }

      const total = group.lessonPackages[0]?.totalLessons ?? group.monthlyLessons ?? 8
      const held = group.lessonSessions.length
      const remaining = total - held

      // Numărătoarea inversă (3 → 2 → 1) umplea Telegramul degeaba: singurul
      // moment în care cineva trebuie să facă ceva e când pachetul lunii s-a
      // terminat. Anunțăm deci doar la ultima lecție ținută (8 din 8) și, mai
      // departe, dacă se predă peste pachet.
      if (remaining > 0) continue

      const type = remaining < 0 ? 'NEGATIVE_LESSONS' : 'ZERO_LESSONS'

      // O singură notificare per valoare: 0 → -1 → -2 anunță de fiecare dată,
      // dar aceeași valoare nu se repetă zi de zi.
      const lastForGroup = await prisma.notification.findFirst({
        where: {
          groupId: group.id,
          type: { in: ['LOW_LESSONS', 'ZERO_LESSONS', 'NEGATIVE_LESSONS'] },
          createdAt: { gte: monthStart },
        },
        orderBy: { createdAt: 'desc' },
        select: { data: true },
      })
      if (lastForGroup?.data?.remaining === remaining) continue

      const unpaidStudents = group.groupStudents
        .filter((gs) => gs.payments.length === 0)
        .map((gs) => gs.student.fullName)

      await prisma.notification.create({
        data: {
          type,
          title: remaining < 0
            ? `🔴 ${group.name}: ${Math.abs(remaining)} lecții peste pachet`
            : remaining === 0
              ? `⚠️ ${group.name}: pachetul lunii s-a terminat`
              : `📉 ${group.name}: ${remaining === 1 ? 'a mai rămas 1 lecție' : `au mai rămas ${remaining} lecții`}`,
          message: `Grupa "${group.name}" a ținut ${held} din ${total} lecții în ${monthLabel}.` +
            (unpaidStudents.length > 0 ? ` Neachitat: ${unpaidStudents.join(', ')}.` : ''),
          link: `/admin/groups/${group.id}`,
          recipientId: null,
          groupId: group.id,
          data: { total, held, remaining, unpaidStudents },
        },
      })

      await notifyGroupLessonsLow({
        groupName: group.name,
        levelName: group.level,
        teacherName: group.teacher?.name,
        total,
        held,
        remaining,
        monthLabel,
        unpaidStudents,
      })

      notificationsCreated.push(`Grupă ${group.name}: ${held}/${total} lecții`)
    }

    // ============================================
    // 6. CLEANUP OLD NOTIFICATIONS (older than 30 days)
    // ============================================
    
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    await prisma.notification.deleteMany({
      where: {
        createdAt: { lt: thirtyDaysAgo },
        read: true
      }
    })

    // ============================================
    // 7. SECURITY CLEANUP (sessions, tokens, rate limits, audit logs)
    // ============================================
    
    const securityCleanup = {}
    try {
      securityCleanup.sessions = await cleanupExpiredSessions()
      securityCleanup.stepUpTokens = await cleanupExpiredStepUpTokens()
      securityCleanup.rateLimitBuckets = await cleanupExpiredBuckets()
      securityCleanup.captchaStates = await cleanupCaptchaStates()
      securityCleanup.auditLogs = await cleanupOldAuditLogs()
    } catch (e) {
      console.error('Security cleanup error:', e.message)
      securityCleanup.error = e.message
    }

    return NextResponse.json({ 
      success: true,
      notificationsCreated,
      count: notificationsCreated.length,
      securityCleanup,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error in notifications cron:', error)
    return NextResponse.json({ 
      error: 'Eroare la generarea notificărilor',
      details: error.message 
    }, { status: 500 })
  }
}
