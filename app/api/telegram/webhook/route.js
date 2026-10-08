import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { convertLeadToStudent, isWonStatus } from '@/lib/lead-conversion'
import { syncSessionSalary } from '@/lib/salary'

export const runtime = 'nodejs'
export const maxDuration = 10

const BOT_TOKEN = process.env.TELEGRAM_LESSONS_BOT_TOKEN
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET

const STATUS_LABELS = {
  LEAD: '🔵 New lead',
  CONTACTAT: '🟡 Contactat',
  FOLLOW_UP_1: '📞 Follow up 1',
  FOLLOW_UP_2: '📲 Follow up 2',
  FOLLOW_UP_2_PLUS: '🔁 Follow up 2+',
  PROGRAMAT_TESTARE: '📝 Programat testare',
  OLD_STUDENT: '🎒 Old student',
  PROGRAMAT: '🟠 Programat',
  FINALIZAT_LECTIA: '🎓 Finalizat',
  WAITLIST: '📋 Waitlist',
  ASTEPTAM_PLATA: '💵 Așteptăm plata',
  PLATIT: '💰 Achitat',
  LOST_LEAD: '❌ Anulat',
}

// Statusuri finale — butoanele dispar
const FINAL_STATUSES = ['PLATIT', 'LOST_LEAD']

function buildKeyboard(contactId) {
  return [
    [
      { text: '✅ Contactat', callback_data: `c:CONTACTAT:${contactId}` },
      { text: '📅 Programat', callback_data: `c:PROGRAMAT:${contactId}` },
    ],
    [
      { text: '🎓 Finalizat', callback_data: `c:FINALIZAT_LECTIA:${contactId}` },
      { text: '⏳ Așteptăm', callback_data: `c:WAITLIST:${contactId}` },
    ],
    [
      { text: '💰 Achitat', callback_data: `c:PLATIT:${contactId}` },
      { text: '❌ Anulat', callback_data: `c:LOST_LEAD:${contactId}` },
    ],
  ]
}

// Apelurile către Telegram nu trebuie să eșueze în tăcere — altfel butonul
// pare „mort" fără nicio urmă în logs.
async function callTelegram(method, payload) {
  if (!BOT_TOKEN) {
    console.error(`[telegram/${method}] TELEGRAM_LESSONS_BOT_TOKEN lipsește`)
    return null
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!data.ok) console.error(`[telegram/${method}] ${data.error_code}: ${data.description}`)
    return data
  } catch (err) {
    console.error(`[telegram/${method}] fetch failed:`, err.message)
    return null
  }
}

async function answerCallback(callbackQueryId, text) {
  return callTelegram('answerCallbackQuery', { callback_query_id: callbackQueryId, text })
}

async function editMessage(chatId, messageId, text, keyboard) {
  return callTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
  })
}

// ============================================
// HANDLERS PENTRU LECȚII NEEFECTUATE
// ============================================

/** Construiește mesajul + tastatura pentru marcarea prezenței la o lecție.
 *  Optimizat: 2 query-uri paralele (sau 0 dacă prefetched). */
async function buildAttendanceView(sessionId, prefetched = null) {
  let session, groupStudents
  if (prefetched) {
    session = prefetched.session
    groupStudents = prefetched.groupStudents
  } else {
    // Fetch în paralel sesiunea + elevii activi
    const sessionPromise = prisma.lessonSession.findUnique({
      where: { id: sessionId },
      include: {
        group: { select: { id: true, name: true, teacher: { select: { name: true } } } },
        attendances: { select: { studentId: true, status: true } },
      },
    })
    const [s] = await Promise.all([sessionPromise])
    if (!s) return null
    session = s
    groupStudents = await prisma.groupStudent.findMany({
      where: { groupId: session.groupId, status: { notIn: ['LEFT', 'TRANSFERRED'] } },
      select: { studentId: true, student: { select: { fullName: true } } },
    })
  }

  const attendanceMap = new Map(session.attendances.map(a => [a.studentId, a.status]))

  const dateStr = new Date(session.date).toLocaleString('ro-RO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Chisinau',
  })

  let presentCount = 0
  let absentCount = 0
  const lines = groupStudents.map(gs => {
    const status = attendanceMap.get(gs.studentId) || 'PRESENT'
    if (status === 'PRESENT') { presentCount++; return `✅ ${gs.student.fullName}` }
    absentCount++; return `❌ ${gs.student.fullName}`
  })

  const text = `📝 <b>MARCHEAZĂ PREZENȚA</b>

📚 Grupa: <b>${session.group.name}</b>
📘 Nivel: ${session.group.level}
👨‍🏫 Profesor: ${session.group.teacher?.name || 'N/A'}
📅 Data: ${dateStr}

<b>Elevi (${groupStudents.length}):</b>
${lines.join('\n')}

📊 ${presentCount} prezenți / ${absentCount} absenți

<i>Apasă pe nume pentru a comuta prezența.</i>`

  // Tastatură: 1 buton per elev (toggle), apoi rândul de acțiuni globale
  const keyboard = groupStudents.map(gs => {
    const status = attendanceMap.get(gs.studentId) || 'PRESENT'
    const icon = status === 'PRESENT' ? '✅' : '❌'
    // Truncate name dacă e prea lung (Telegram limita 64 bytes pentru button text + callback)
    const name = gs.student.fullName.length > 28 ? gs.student.fullName.slice(0, 27) + '…' : gs.student.fullName
    return [{ text: `${icon} ${name}`, callback_data: `at:${sessionId}:${gs.studentId}` }]
  })

  keyboard.push([
    { text: '✅ Toți prezenți', callback_data: `aa:p:${sessionId}` },
    { text: '❌ Toți absenți', callback_data: `aa:a:${sessionId}` },
  ])
  keyboard.push([
    { text: '💾 Confirmă & Salvează', callback_data: `as:${sessionId}` },
  ])

  return { text, keyboard }
}

export async function POST(request) {
  try {
    // Verificare secret
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
      // Cauza tipică pentru „butoanele nu fac nimic": webhook înregistrat fără
      // ?secret= sau cu un secret vechi. Fără log, eroarea e invizibilă.
      console.error('[telegram/webhook] Secret invalid sau lipsă în URL-ul webhook-ului')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // ── /start <token> — conectarea unui cont la Telegram ──
    // Linkul din CRM (t.me/bot?start=TOKEN) aduce token-ul aici, iar chat ID-ul
    // se scrie singur pe contul respectiv. Nimeni nu mai caută ID-uri manual.
    if (body.message?.text?.startsWith("/start")) {
      const chat = body.message.chat
      const token = body.message.text.trim().split(" ")[1]

      if (!token) {
        await callTelegram("sendMessage", {
          chat_id: chat.id,
          text: "Salut! Ca să primești notificări, deschide linkul de conectare din contul tău în CRM → secțiunea Telegram.",
        })
        return NextResponse.json({ ok: true })
      }

      const user = await prisma.user.findFirst({
        where: { telegramLinkToken: token, telegramLinkExpires: { gt: new Date() } },
        select: { id: true, name: true, email: true },
      })

      if (!user) {
        await callTelegram("sendMessage", {
          chat_id: chat.id,
          text: "❌ Link expirat sau deja folosit. Generează altul din CRM → Securitate → Telegram.",
        })
        return NextResponse.json({ ok: true })
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          telegramChatId: String(chat.id),
          telegramUsername: body.message.from?.username || null,
          telegramLinkToken: null,
          telegramLinkExpires: null,
        },
      })

      await callTelegram("sendMessage", {
        chat_id: chat.id,
        parse_mode: "HTML",
        text: `✅ Cont conectat: <b>${user.name || user.email}</b>

De acum primești aici notificările tale din CRM.`,
      })

      return NextResponse.json({ ok: true })
    }

    // Procesare callback query (apăsare buton)
    if (body.callback_query) {
      const { id: callbackQueryId, data, message } = body.callback_query
      const messageId = message.message_id
      const chatId = message.chat.id

      // ============================================
      // ROUTING: m: (missed lesson), at: (toggle), aa: (all), as: (save)
      // ============================================

      // ── m:y / m:n — răspuns inițial pentru lecție neefectuată ──
      if (data?.startsWith('m:')) {
        const parts = data.split(':')
        if (parts.length !== 3) {
          await answerCallback(callbackQueryId, '❌ Date invalide')
          return NextResponse.json({ ok: true })
        }
        const [, action, missedSessionId] = parts

        const missed = await prisma.missedSession.findUnique({
          where: { id: missedSessionId },
          include: { group: { include: { teacher: { select: { name: true } } } } },
        })
        if (!missed) {
          await answerCallback(callbackQueryId, '❌ Lecția nu a fost găsită')
          return NextResponse.json({ ok: true })
        }

        // ── NU s-a efectuat ──
        if (action === 'n') {
          const dateStr = new Date(missed.scheduledDate).toLocaleString('ro-RO', {
            day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Chisinau',
          })
          const finalText = `❌ <b>LECȚIE CONFIRMATĂ NEEFECTUATĂ</b>

📚 Grupa: <b>${missed.group.name}</b>
👨‍🏫 Profesor: ${missed.group.teacher?.name || 'N/A'}
📘 Nivel: ${missed.group.level}
📅 ${dateStr} la ${missed.scheduledTime}

⚠️ Marcată ca neefectuată în sistem.`

          // Toate în paralel → răspuns instant
          await Promise.all([
            prisma.missedSession.update({
              where: { id: missedSessionId },
              data: { acknowledged: true, reason: 'Confirmat ca neefectuată din Telegram' },
            }),
            editMessage(chatId, messageId, finalText, null),
            answerCallback(callbackQueryId, '✅ Marcată ca neefectuată'),
          ])
          return NextResponse.json({ ok: true })
        }

        // ── S-a efectuat → creează LessonSession + Attendances default PRESENT ──
        if (action === 'y') {
          // Verifică dacă deja există o sesiune pentru acea zi (idempotent)
          const dayStart = new Date(missed.scheduledDate); dayStart.setHours(0, 0, 0, 0)
          const dayEnd = new Date(missed.scheduledDate); dayEnd.setHours(23, 59, 59, 999)

          // Paralel: caută sesiunea existentă + elevii activi + ack
          const ackPromise = answerCallback(callbackQueryId, '✅ Lecție creată')
          const [existingSession, activeStudents] = await Promise.all([
            prisma.lessonSession.findFirst({
              where: { groupId: missed.groupId, date: { gte: dayStart, lte: dayEnd } },
            }),
            prisma.groupStudent.findMany({
              where: { groupId: missed.groupId, status: { notIn: ['LEFT', 'TRANSFERRED'] } },
              select: { studentId: true, student: { select: { fullName: true } } },
            }),
          ])

          let lessonSession = existingSession
          if (!lessonSession) {
            lessonSession = await prisma.lessonSession.create({
              data: { groupId: missed.groupId, date: missed.scheduledDate },
            })
          }

          // BATCH: creează toate attendances default PRESENT (skipDuplicates pentru idempotency)
          await Promise.all([
            prisma.attendance.createMany({
              data: activeStudents.map(s => ({
                sessionId: lessonSession.id,
                studentId: s.studentId,
                status: 'PRESENT',
              })),
            }).catch(() => {}), // ignoră dacă există deja
            prisma.missedSession.update({
              where: { id: missedSessionId },
              data: { acknowledged: true, reason: 'Lecția a fost confirmată ca efectuată din Telegram' },
            }),
          ])

          // Construim view-ul direct cu datele din memorie
          const sessionWithGroup = {
            ...lessonSession,
            group: {
              id: missed.groupId,
              name: missed.group.name,
              level: missed.group.level,
              teacher: missed.group.teacher,
            },
            attendances: activeStudents.map(s => ({ studentId: s.studentId, status: 'PRESENT' })),
          }
          const view = await buildAttendanceView(lessonSession.id, {
            session: sessionWithGroup,
            groupStudents: activeStudents,
          })

          await Promise.all([
            ackPromise,
            view ? editMessage(chatId, messageId, view.text, view.keyboard) : Promise.resolve(),
          ])
          return NextResponse.json({ ok: true })
        }
      }

      // ── at:<sessionId>:<studentId> — toggle prezență individuală ──
      if (data?.startsWith('at:')) {
        const parts = data.split(':')
        if (parts.length !== 3) {
          await answerCallback(callbackQueryId, '❌ Date invalide')
          return NextResponse.json({ ok: true })
        }
        const [, sessionId, studentId] = parts

        // Paralel: citește attendance existent + lecția (pentru lessonsDeducted)
        const [existing, lesson] = await Promise.all([
          prisma.attendance.findUnique({
            where: { sessionId_studentId: { sessionId, studentId } },
            select: { status: true },
          }),
          prisma.lessonSession.findUnique({ where: { id: sessionId }, select: { lessonsDeducted: true } }),
        ])

        if (!lesson || lesson.lessonsDeducted) {
          await answerCallback(callbackQueryId, '❌ Sesiune deja salvată')
          return NextResponse.json({ ok: true })
        }

        const newStatus = existing?.status === 'PRESENT' ? 'ABSENT' : 'PRESENT'

        // Paralel: ack-ul instant + upsert-ul
        await Promise.all([
          answerCallback(callbackQueryId, newStatus === 'PRESENT' ? '✅ Prezent' : '❌ Absent'),
          prisma.attendance.upsert({
            where: { sessionId_studentId: { sessionId, studentId } },
            update: { status: newStatus },
            create: { sessionId, studentId, status: newStatus },
          }),
        ])

        const view = await buildAttendanceView(sessionId)
        if (view) await editMessage(chatId, messageId, view.text, view.keyboard)
        return NextResponse.json({ ok: true })
      }

      // ── aa:p / aa:a — toți prezenți / toți absenți (BATCH OPTIMIZED) ──
      if (data?.startsWith('aa:')) {
        const parts = data.split(':')
        if (parts.length !== 3) {
          await answerCallback(callbackQueryId, '❌ Date invalide')
          return NextResponse.json({ ok: true })
        }
        const [, mode, sessionId] = parts
        const newStatus = mode === 'p' ? 'PRESENT' : 'ABSENT'

        const lesson = await prisma.lessonSession.findUnique({
          where: { id: sessionId },
          select: { lessonsDeducted: true, groupId: true },
        })
        if (!lesson || lesson.lessonsDeducted) {
          await answerCallback(callbackQueryId, '❌ Sesiune deja salvată')
          return NextResponse.json({ ok: true })
        }

        // Ack instant + munca în paralel
        const ackPromise = answerCallback(callbackQueryId, newStatus === 'PRESENT' ? '✅ Toți prezenți' : '❌ Toți absenți')

        const activeStudents = await prisma.groupStudent.findMany({
          where: { groupId: lesson.groupId, status: { notIn: ['LEFT', 'TRANSFERRED'] } },
          select: { studentId: true, student: { select: { fullName: true } } },
        })

        // BATCH: șterge toate apoi creează toate (2 queries vs N upserts)
        await prisma.attendance.deleteMany({ where: { sessionId } })
        await prisma.attendance.createMany({
          data: activeStudents.map(s => ({ sessionId, studentId: s.studentId, status: newStatus })),
        })

        // Construim direct view-ul cu datele în memorie (0 queries adiționale)
        const sessionData = await prisma.lessonSession.findUnique({
          where: { id: sessionId },
          include: {
            group: { select: { id: true, name: true, teacher: { select: { name: true } } } },
          },
        })
        const fakeAttendances = activeStudents.map(s => ({ studentId: s.studentId, status: newStatus }))
        const view = await buildAttendanceView(sessionId, {
          session: { ...sessionData, attendances: fakeAttendances },
          groupStudents: activeStudents,
        })
        await Promise.all([
          ackPromise,
          view ? editMessage(chatId, messageId, view.text, view.keyboard) : Promise.resolve(),
        ])
        return NextResponse.json({ ok: true })
      }

      // ── as:<sessionId> — confirmă și deduce lecția ──
      if (data?.startsWith('as:')) {
        const parts = data.split(':')
        if (parts.length !== 2) {
          await answerCallback(callbackQueryId, '❌ Date invalide')
          return NextResponse.json({ ok: true })
        }
        const [, sessionId] = parts

        const lesson = await prisma.lessonSession.findUnique({
          where: { id: sessionId },
          include: {
            group: { include: { teacher: { select: { name: true } } } },
            attendances: true,
          },
        })
        if (!lesson) {
          await answerCallback(callbackQueryId, '❌ Sesiune negăsită')
          return NextResponse.json({ ok: true })
        }
        if (lesson.lessonsDeducted) {
          await answerCallback(callbackQueryId, '⚠️ Deja salvată')
          return NextResponse.json({ ok: true })
        }

        // Ack instant
        const ackPromise = answerCallback(callbackQueryId, '✅ Salvată cu succes!')

        // Deduce lecții pentru prezenți, incrementează absențe pentru absenți (ÎN PARALEL)
        const activeStudents = await prisma.groupStudent.findMany({
          where: { groupId: lesson.groupId, status: { notIn: ['LEFT', 'TRANSFERRED'] } },
          select: { id: true, studentId: true },
        })
        const studentMap = new Map(activeStudents.map(s => [s.studentId, s.id]))

        let presentCount = 0
        let absentCount = 0
        const transactions = []
        const updatePromises = []

        for (const att of lesson.attendances) {
          const gsId = studentMap.get(att.studentId)
          if (!gsId) continue
          if (att.status === 'PRESENT') {
            presentCount++
            updatePromises.push(prisma.groupStudent.update({
              where: { id: gsId },
              data: { lessonsRemaining: { decrement: 1 } },
            }))
            transactions.push({
              studentId: att.studentId,
              groupId: lesson.groupId,
              sessionId: lesson.id,
              delta: -1,
              reason: `Lecție prezent (din Telegram) - ${new Date(lesson.date).toLocaleDateString('ro-RO')}`,
            })
          } else {
            absentCount++
            updatePromises.push(prisma.groupStudent.update({
              where: { id: gsId },
              data: { absences: { increment: 1 } },
            }))
          }
        }

        // Execută TOATE update-urile + transactions + lessonSession update în paralel
        await Promise.all([
          ...updatePromises,
          transactions.length > 0
            ? prisma.lessonTransaction.createMany({ data: transactions })
            : Promise.resolve(),
          prisma.lessonSession.update({
            where: { id: sessionId },
            data: { lessonsDeducted: true },
          }),
        ])

        // Lecția ținută intră în salariul profesorului, după regula grupei
        await syncSessionSalary(sessionId)

        const dateStr = new Date(lesson.date).toLocaleString('ro-RO', {
          day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Chisinau',
        })
        const finalText = `✅ <b>LECȚIE SALVATĂ</b>

📚 Grupa: <b>${lesson.group.name}</b>
👨‍🏫 Profesor: ${lesson.group.teacher?.name || 'N/A'}
📘 Nivel: ${lesson.group.level}
📅 ${dateStr}

📊 Rezultat:
✅ Prezenți: <b>${presentCount}</b> (lecție dedusă)
❌ Absenți: <b>${absentCount}</b> (absență înregistrată)

✔ Lecția a fost înregistrată în sistem.`

        await Promise.all([
          ackPromise,
          editMessage(chatId, messageId, finalText, null),
        ])
        return NextResponse.json({ ok: true })
      }

      // ── c: — vechiul handler pentru contact (păstrat) ──
      if (data?.startsWith('c:')) {
      const parts = data.split(':')
      if (parts.length !== 3) {
        await answerCallback(callbackQueryId, '❌ Date invalide')
        return NextResponse.json({ ok: true })
      }

      const [, newStatus, contactId] = parts

      // Validare status
      if (!STATUS_LABELS[newStatus]) {
        await answerCallback(callbackQueryId, '❌ Status invalid')
        return NextResponse.json({ ok: true })
      }

      // Actualizare în baza de date
      let contact
      try {
        contact = await prisma.lead.update({
          where: { id: contactId },
          data: { status: newStatus },
        })

        // Lead câștigat din Telegram → elevul apare automat în lista de elevi
        if (isWonStatus(contact.status) && !contact.convertedStudentId) {
          await convertLeadToStudent(contact)
        }
      } catch (dbError) {
        console.error('DB update error:', dbError)
        await answerCallback(callbackQueryId, '❌ Eroare la actualizare')
        return NextResponse.json({ ok: true })
      }

      const newStatusLabel = STATUS_LABELS[newStatus]
      const isFinal = FINAL_STATUSES.includes(newStatus)
      const now = new Date().toLocaleString('ro-RO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Chisinau',
      })

      const isFromSiteForm = contact.source === 'SITE'
      const emailLine = isFromSiteForm ? '🌐 Sursă: <b>Formular site</b>' : `📧 Email: ${contact.email || 'N/A'}`

      // Mesajul actualizat cu noul status
      const updatedText = `📬 <b>CERERE LECȚIE GRATUITĂ</b>

👤 Nume: <b>${contact.name}</b>
${emailLine}
📱 Telefon: <b>${contact.phone || 'N/A'}</b>

📊 Status: ${newStatusLabel}
✏️ Actualizat: ${now}`

      // Dacă status final → butoane dispar; altfel → butoane rămân
      const keyboard = isFinal ? null : buildKeyboard(contactId)

      await Promise.all([
        editMessage(chatId, messageId, updatedText, keyboard),
        answerCallback(callbackQueryId, `✅ Status: ${newStatusLabel}`),
      ])

      return NextResponse.json({ ok: true })
      } // end if c:

      // Dacă nu a matched nimic
      await answerCallback(callbackQueryId, '❌ Acțiune necunoscută')
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * Diagnostic: verifică dacă webhook-ul e înregistrat corect la Telegram.
 * Acces doar cu secretul: /api/telegram/webhook?secret=...
 * Arată URL-ul înregistrat, câte update-uri stau în coadă și ultima eroare.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')

  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!BOT_TOKEN) {
    return NextResponse.json({ error: 'TELEGRAM_LESSONS_BOT_TOKEN lipsește' }, { status: 500 })
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`)
    const data = await res.json()
    if (!data.ok) {
      return NextResponse.json({ error: data.description }, { status: 502 })
    }

    const info = data.result
    const expectedPath = '/api/telegram/webhook'
    const registeredUrl = info.url || ''

    return NextResponse.json({
      registeredUrl,
      hasSecretInUrl: registeredUrl.includes('secret='),
      secretMatches: registeredUrl.includes(`secret=${WEBHOOK_SECRET}`),
      pathOk: registeredUrl.includes(expectedPath),
      pendingUpdates: info.pending_update_count,
      lastErrorMessage: info.last_error_message || null,
      lastErrorDate: info.last_error_date
        ? new Date(info.last_error_date * 1000).toISOString()
        : null,
      allowedUpdates: info.allowed_updates || null,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
