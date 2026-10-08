/**
 * Telegram Bot Utility
 * Pentru trimiterea notificărilor pe Telegram
 */

// Bot pentru notificări lecții (ratate, puține, zero)
const TELEGRAM_LESSONS_BOT_TOKEN = process.env.TELEGRAM_LESSONS_BOT_TOKEN
const TELEGRAM_LESSONS_CHAT_ID = process.env.TELEGRAM_LESSONS_CHAT_ID

// Bot pentru înscrieri și contact
const TELEGRAM_CONTACT_BOT_TOKEN = process.env.TELEGRAM_CONTACT_BOT_TOKEN
const TELEGRAM_CONTACT_CHAT_ID = process.env.TELEGRAM_CONTACT_CHAT_ID

// Admin chat with threads
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID
const TELEGRAM_MISSED_LESSONS_THREAD_ID = process.env.TELEGRAM_MISSED_LESSONS_THREAD_ID
const TELEGRAM_LOW_LESSONS_THREAD_ID = process.env.TELEGRAM_LOW_LESSONS_THREAD_ID
const TELEGRAM_ENROLLMENTS_THREAD_ID = process.env.TELEGRAM_ENROLLMENTS_THREAD_ID
const TELEGRAM_TEACHER_ACTIVITIES_THREAD_ID = process.env.TELEGRAM_TEACHER_ACTIVITIES_THREAD_ID
// Topic separat pentru cereri de contact / lecție gratuită.
// Dacă nu e setat, cade pe topicul de înscrieri (comportamentul vechi).
const TELEGRAM_CONTACT_THREAD_ID = process.env.TELEGRAM_CONTACT_THREAD_ID || TELEGRAM_ENROLLMENTS_THREAD_ID

/**
 * Rutarea centralizată: ce tip de mesaj merge în ce topic.
 * Toate notificările de admin folosesc TELEGRAM_ADMIN_CHAT_ID (grup cu topic-uri).
 */
const escapeHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const TELEGRAM_ROUTES = {
  // Lecții/recuperări neefectuate, nepornite sau anulate
  missedLessons: TELEGRAM_MISSED_LESSONS_THREAD_ID,
  // Ore rămase: puține / zero / negative
  lowLessons: TELEGRAM_LOW_LESSONS_THREAD_ID,
  // Înscrieri de pe site
  enrollments: TELEGRAM_ENROLLMENTS_THREAD_ID,
  // Cereri de contact / lecție gratuită
  contact: TELEGRAM_CONTACT_THREAD_ID,
  // Activități profesori (grupă nouă, elev nou, plată, modificări grupă)
  teacherActivities: TELEGRAM_TEACHER_ACTIVITIES_THREAD_ID,
}

/**
 * Trimite mesaj pe Telegram
 */
async function sendTelegramMessage(botToken, chatId, message, parseMode = 'HTML', threadId = null) {
  if (!botToken || !chatId) {
    console.error('[telegram] Lipsește botToken sau chatId — mesaj netrimis:', message.substring(0, 60))
    return false
  }

  try {
    const body = {
      chat_id: chatId,
      text: message,
      parse_mode: parseMode,
      link_preview_options: { is_disabled: true },
    }
    
    // Add thread_id if specified (for topic groups)
    if (threadId) {
      body.message_thread_id = parseInt(threadId)
    }
    
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    const data = await response.json()
    
    if (!data.ok) {
      console.error('Telegram error:', data.description)
      return false
    }
    
    return true
  } catch (error) {
    console.error('Error sending Telegram message:', error)
    return false
  }
}

/**
 * Trimite mesaj cu butoane inline pe Telegram
 */
async function sendTelegramMessageWithKeyboard(botToken, chatId, message, keyboard, threadId = null) {
  if (!botToken || !chatId) {
    console.log('Telegram not configured, skipping notification with keyboard')
    return null
  }

  try {
    const body = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: keyboard }
    }

    if (threadId) {
      body.message_thread_id = parseInt(threadId)
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    const data = await response.json()

    if (!data.ok) {
      console.error('Telegram keyboard error:', data.description)
      return null
    }

    return data.result.message_id
  } catch (error) {
    console.error('Error sending Telegram message with keyboard:', error)
    return null
  }
}

/**
 * Notificare lecții puține/zero/negative (Thread 2 - Ore Rămase)
 * Trimite doar pentru <=1 lecții
 *
 * @param {Object} options.studentDetails - { parentName, parentPhone, parentEmail, lastPaymentAmount, lastPaymentDate }
 */
export async function notifyLowLessons(studentName, groupName, levelName, lessonsRemaining, studentDetails = null) {
  let emoji, status

  if (lessonsRemaining < 0) {
    emoji = '🔴'
    status = `LECȚII NEGATIVE (${lessonsRemaining})`
  } else if (lessonsRemaining === 0) {
    emoji = '⚠️'
    status = 'ZERO LECȚII'
  } else {
    emoji = '📉'
    status = `DOAR ${lessonsRemaining} LECȚII`
  }

  // Detalii contact + ultima plată (opționale)
  let contactBlock = ''
  if (studentDetails) {
    const { parentName, parentPhone, parentEmail, lastPaymentAmount, lastPaymentDate } = studentDetails
    const lines = []
    if (parentName) lines.push(`👨‍👩‍👦 Părinte: ${parentName}`)
    if (parentPhone) lines.push(`📞 Telefon: <a href="tel:${parentPhone}">${parentPhone}</a>`)
    if (parentEmail) lines.push(`✉️ Email: ${parentEmail}`)
    if (lastPaymentAmount != null) {
      let paymentLine = `💰 Ultima plată: <b>${Number(lastPaymentAmount).toLocaleString('ro-RO')} lei</b>`
      if (lastPaymentDate) {
        try {
          const d = new Date(lastPaymentDate).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' })
          paymentLine += ` (${d})`
        } catch {}
      }
      lines.push(paymentLine)
    } else {
      lines.push('💰 Ultima plată: <i>fără plăți</i>')
    }
    if (lines.length > 0) {
      contactBlock = '\n\n' + lines.join('\n')
    }
  }

  const message = `${emoji} <b>${status}</b>

👤 Elev: <b>${studentName}</b>
📚 Grupa: ${groupName}
📘 Nivel: ${levelName}
📊 Lecții rămase: <b>${lessonsRemaining}</b>${contactBlock}

${lessonsRemaining <= 0 ? '⚡ Contactați părinții pentru reînnoire!' : ''}`

  return sendTelegramMessage(
    TELEGRAM_LESSONS_BOT_TOKEN, 
    TELEGRAM_ADMIN_CHAT_ID, 
    message,
    'HTML',
    TELEGRAM_LOW_LESSONS_THREAD_ID
  )
}

/**
 * Lecțiile rămase din pachetul lunar al grupei — Thread „Ore Rămase".
 *
 * Se numără per grupă, nu per elev: din cele 8 lecții ale lunii, câte s-au
 * ținut și câte au mai rămas. Absențele individuale nu schimbă socoteala —
 * lecția s-a ținut pentru toți.
 */
export async function notifyGroupLessonsLow({
  groupName, levelName, teacherName, total, held, remaining, monthLabel, unpaidStudents = [],
}) {
  const emoji = remaining < 0 ? '🔴' : remaining === 0 ? '⚠️' : '📉'
  const status = remaining < 0
    ? `${Math.abs(remaining)} ${Math.abs(remaining) === 1 ? 'LECȚIE' : 'LECȚII'} PESTE PACHET`
    : remaining === 0
      ? 'PACHET EPUIZAT'
      : `AU MAI RĂMAS ${remaining} ${remaining === 1 ? 'LECȚIE' : 'LECȚII'}`

  const lines = [
    `${emoji} <b>${status}</b>`,
    '',
    `📚 Grupa: <b>${escapeHtml(groupName)}</b>`,
    `📘 Nivel: ${escapeHtml(levelName || '—')}`,
    `👨‍🏫 Profesor: ${escapeHtml(teacherName || '—')}`,
    `🗓 Luna: ${escapeHtml(monthLabel)}`,
    `📊 Ținute: <b>${held}</b> din <b>${total}</b>`,
  ]

  if (unpaidStudents.length > 0) {
    lines.push('', `💰 Neachitat luna aceasta (${unpaidStudents.length}):`)
    lines.push(...unpaidStudents.slice(0, 15).map((n) => `• ${escapeHtml(n)}`))
    if (unpaidStudents.length > 15) lines.push(`• …și încă ${unpaidStudents.length - 15}`)
  }

  if (remaining === 0) {
    lines.push('', '⚡ Pachetul lunii s-a terminat — pregătiți plata pentru luna următoare.')
  } else if (remaining < 0) {
    lines.push('', '⚡ S-au ținut mai multe lecții decât s-au achitat luna aceasta.')
  }

  return sendTelegramMessage(
    TELEGRAM_LESSONS_BOT_TOKEN,
    TELEGRAM_ADMIN_CHAT_ID,
    lines.join('\n'),
    'HTML',
    TELEGRAM_LOW_LESSONS_THREAD_ID
  )
}

/**
 * Notificare lecție ratată (grup) - Thread 4 - Lecții Neefectuate
 * Cu butoane interactive: ✅ S-a efectuat / ❌ NU s-a efectuat
 */
export async function notifyMissedGroupSession(groupName, teacherName, levelName, scheduledDay, scheduledTime, studentsCount, missedSessionId = null, teacherChatId = null) {
  const message = `❌ <b>LECȚIE NEEFECTUATĂ</b>

📚 Grupa: <b>${escapeHtml(groupName)}</b>
👨‍🏫 Profesor: ${escapeHtml(teacherName || '—')}
📘 Nivel: ${escapeHtml(levelName || '—')}
📅 Programat: ${escapeHtml(scheduledDay || '—')} la ${escapeHtml(scheduledTime || 'ora neprecizată')}
👥 Elevi afectați: ${studentsCount}

⚡ Verificați situația!`

  const keyboard = missedSessionId
    ? [
        [
          { text: '✅ S-a efectuat', callback_data: `m:y:${missedSessionId}` },
          { text: '❌ NU s-a efectuat', callback_data: `m:n:${missedSessionId}` },
        ],
      ]
    : null

  // Profesorul primește același mesaj în privat, cu aceleași butoane: de acolo
  // confirmă lecția și marchează prezența, fără să mai intre în CRM.
  if (teacherChatId) {
    const teacherMessage = keyboard
      ? `${message}

👉 Confirmă mai jos. Dacă lecția a avut loc, poți marca prezența direct de aici.`
      : message
    await sendTeacherDirectMessage(teacherChatId, teacherMessage, teacherName, keyboard)
  }

  if (keyboard) {
    return sendTelegramMessageWithKeyboard(
      TELEGRAM_LESSONS_BOT_TOKEN,
      TELEGRAM_ADMIN_CHAT_ID,
      message,
      keyboard,
      TELEGRAM_MISSED_LESSONS_THREAD_ID
    )
  }

  return sendTelegramMessage(
    TELEGRAM_LESSONS_BOT_TOKEN,
    TELEGRAM_ADMIN_CHAT_ID,
    message,
    'HTML',
    TELEGRAM_MISSED_LESSONS_THREAD_ID
  )
}

/**
 * Notificare recuperare ratată - Thread 4 - Lecții Neefectuate
 */
export async function notifyMissedMakeup(groupName, teacherName, scheduledTime, studentNames, teacherChatId = null) {
  const message = `❌ <b>RECUPERARE NEEFECTUATĂ</b>

📚 Grupa: <b>${escapeHtml(groupName)}</b>
👨‍🏫 Profesor: ${escapeHtml(teacherName || '—')}
🕐 Programat: ${escapeHtml(scheduledTime || '—')}
👥 Elevi: ${escapeHtml(studentNames || 'Nespecificați')}

⚡ Verificați situația!`

  // Și aici profesorul află direct, nu doar grupul de admini
  if (teacherChatId) {
    await sendTeacherDirectMessage(teacherChatId, message, teacherName)
  }

  return sendTelegramMessage(
    TELEGRAM_LESSONS_BOT_TOKEN,
    TELEGRAM_ADMIN_CHAT_ID,
    message,
    'HTML',
    TELEGRAM_MISSED_LESSONS_THREAD_ID
  )
}

/**
 * Notificare activitate profesor - Thread 9 - Activități Profesori
 * Pentru: grupă nouă, elev nou, plată nouă
 */
export async function notifyTeacherActivity(type, teacherName, details) {
  let emoji, title
  
  switch (type) {
    case 'group':
      emoji = '📚'
      title = 'GRUPĂ NOUĂ CREATĂ'
      break
    case 'student':
      emoji = '👤'
      title = 'ELEV NOU CREAT'
      break
    case 'student_group':
      emoji = '➕'
      title = 'ELEV ADĂUGAT ÎN GRUPĂ'
      break
    case 'payment':
      emoji = '💰'
      title = 'PLATĂ NOUĂ ADĂUGATĂ'
      break
    default:
      emoji = '📝'
      title = 'ACTIVITATE PROFESOR'
  }

  const message = `${emoji} <b>${title}</b>

👨‍🏫 Profesor: <b>${teacherName}</b>
${details}

🕐 ${new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau' })}`

  return sendTelegramMessage(
    TELEGRAM_LESSONS_BOT_TOKEN, 
    TELEGRAM_ADMIN_CHAT_ID, 
    message,
    'HTML',
    TELEGRAM_TEACHER_ACTIVITIES_THREAD_ID
  )
}

/**
 * Notificare lecție întârziată (2+ ore) - Thread 4 - Lecții Neefectuate
 */
export async function notifyLateSession(groupName, teacherName, scheduledTime, hoursLate, isRecuperare = false) {
  const type = isRecuperare ? 'RECUPERARE' : 'LECȚIE'
  
  const message = `⏰ <b>${type} NEPORNITĂ</b>

📚 Grupa: <b>${groupName}</b>
👨‍🏫 Profesor: ${teacherName}
🕐 Programat: ${scheduledTime}
⏱ Întârziere: ${hoursLate}

⚡ Profesorul a uitat să pornească lecția!`

  return sendTelegramMessage(
    TELEGRAM_LESSONS_BOT_TOKEN,
    TELEGRAM_ADMIN_CHAT_ID || TELEGRAM_LESSONS_CHAT_ID,
    message,
    'HTML',
    TELEGRAM_ROUTES.missedLessons
  )
}

/**
 * Notificare mesaj contact nou - Thread Contact (fallback: Înscrieri) - cu butoane status inline
 * @param {string} contactId - ID-ul din DB (pentru callback_data)
 */
const LEAD_SOURCE_LABELS = {
  INSTAGRAM: '📸 Instagram',
  MESSENGER: '💬 Messenger',
  FACEBOOK: '📘 Facebook',
  WHATSAPP: '🟢 WhatsApp',
  TELEGRAM: '✈️ Telegram',
  TIKTOK: '🎵 TikTok',
  TELEFON: '📞 Telefon',
  RECOMANDARE: '🤝 Recomandare',
  WALK_IN: '🚪 A venit la sediu',
  SITE: '🌐 Formular site',
  ELEV: '🎓 Pagina Elevi',
  ALTA: '❓ Altă sursă',
}

// Etichetele statusurilor din pipeline (aceleași ca în lib/leads-config.js)
const LEAD_STATUS_LABELS = {
  LEAD: '🔵 New lead',
  FARA_RASPUNS: '🔘 Fără răspuns',
  CONTACTAT: '🟡 Contactat',
  FOLLOW_UP_1: '📞 Follow up 1',
  FOLLOW_UP_2: '📲 Follow up 2',
  FOLLOW_UP_2_PLUS: '🔁 Follow up 2+',
  PROGRAMAT_TESTARE: '📝 Programat testare',
  OLD_STUDENT: '🎒 Old student',
  PROGRAMAT: '🟠 Programat',
  PRIMA_LECTIE: '🟢 Prima lecție',
  FINALIZAT_LECTIA: '⚫ Finalizat lecția',
  SE_GANDESTE: '🤔 Se gândește',
  WAITLIST: '📋 Waitlist',
  ASTEPTAM_PLATA: '💵 Așteptăm plata',
  PLATIT: '💰 A plătit',
  STUDIAZA: '🟣 Studiază',
  PLECAT: '🔴 A plecat',
  LOST_LEAD: '❌ Lead pierdut',
  TEST: '🧪 Test',
}

/**
 * Notificare lead nou — topicul Contact / Lead-uri, cu butoane de status.
 * @param {object} lead - obiectul Lead din baza de date
 */
/** Liniile cu datele unui lead, folosite și la lead nou, și la reminder. */
function leadDetailLines(lead) {
  const sourceLabel = LEAD_SOURCE_LABELS[lead.source] || LEAD_SOURCE_LABELS.ALTA
  const statusLabel = LEAD_STATUS_LABELS[lead.status] || lead.status || '🔵 New lead'
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

  const lines = [
    `👤 Nume: <b>${escapeHtml(lead.name)}</b>`,
    `📥 Sursă: <b>${sourceLabel}</b>${lead.sourceDetail ? ` — ${escapeHtml(lead.sourceDetail)}` : ''}`,
    `📱 Telefon: <b>${escapeHtml(lead.phone || 'N/A')}</b>`,
  ]
  if (lead.email) lines.push(`📧 Email: ${escapeHtml(lead.email)}`)
  if (lead.studentName) {
    const varsta = lead.isAdult ? ', adult' : lead.studentAge ? `, ${lead.studentAge} ani` : ''
    lines.push(`🎓 Elev: ${escapeHtml(lead.studentName)}${varsta}`)
  } else if (lead.isAdult) {
    lines.push('🎓 Adult')
  } else if (lead.studentAge) {
    lines.push(`🎓 Vârstă: ${lead.studentAge} ani`)
  }
  if (lead.interestedIn) lines.push(`📘 Nivel actual: ${escapeHtml(lead.interestedIn)}`)

  lines.push('', `📊 Status: ${statusLabel}`)
  lines.push(`🙋 Responsabil: ${lead.assignedToName ? `<b>${escapeHtml(lead.assignedToName)}</b>` : '<i>nimeni încă</i>'}`)

  if (lead.nextFollowUpAt) {
    const when = new Date(lead.nextFollowUpAt).toLocaleString('ro-RO', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Chisinau',
    })
    lines.push(`🔔 Recontactare: <b>${when}</b>`)
  } else {
    lines.push('🔔 Recontactare: <i>nesetată</i>')
  }

  if (lead.createdByName) lines.push(`✍️ Adăugat de: ${escapeHtml(lead.createdByName)}`)
  if (lead.message) lines.push('', `💬 ${escapeHtml(lead.message)}`)
  if (baseUrl && lead.id) lines.push('', `<a href="${baseUrl}/admin/leads/${lead.id}">Deschide fișa în CRM</a>`)

  return lines
}

/** Butoanele de status, aceleași peste tot. */
function buildLeadKeyboard(leadId) {
  return [
    [
      { text: '✅ Contactat', callback_data: `c:CONTACTAT:${leadId}` },
      { text: '📅 Programat', callback_data: `c:PROGRAMAT:${leadId}` },
    ],
    [
      { text: '🎓 Finalizat', callback_data: `c:FINALIZAT_LECTIA:${leadId}` },
      { text: '⏳ Așteptăm', callback_data: `c:WAITLIST:${leadId}` },
    ],
    [
      { text: '💰 Achitat', callback_data: `c:PLATIT:${leadId}` },
      { text: '❌ Pierdut', callback_data: `c:LOST_LEAD:${leadId}` },
    ],
  ]
}

/**
 * Reminder de recontactare, trimis persoanei responsabile.
 * Aceleași date ca la lead nou, plus butoanele de status — ca să poată
 * închide acțiunea direct din Telegram.
 */
export async function notifyLeadReminder(lead, { chatId, daysOverdue = 0 } = {}) {
  if (!chatId) return false

  const header = daysOverdue > 0
    ? `⏰ <b>REMINDER — RECONTACTARE RESTANTĂ</b> (${daysOverdue} ${daysOverdue === 1 ? 'zi' : 'zile'})`
    : '🔔 <b>REMINDER — DE RECONTACTAT ACUM</b>'

  const msg = [header, '', ...leadDetailLines(lead)].join('\n')

  return lead.id
    ? sendTelegramMessageWithKeyboard(TELEGRAM_LESSONS_BOT_TOKEN, chatId, msg, buildLeadKeyboard(lead.id))
    : sendTelegramMessage(TELEGRAM_LESSONS_BOT_TOKEN, chatId, msg)
}

/**
 * Lead-ul ajunge direct la persoana responsabilă, în privat.
 * Aceleași date ca în topicul comun, plus butoanele de status.
 */
export async function notifyLeadAssigned(lead, { chatId, isNew = true } = {}) {
  if (!chatId) return false

  const header = isNew
    ? '🎯 <b>LEAD NOU — ție ți-a fost atribuit</b>'
    : '👤 <b>Ți-a fost atribuit un lead</b>'

  const msg = [header, '', ...leadDetailLines(lead)].join('\n')

  return lead.id
    ? sendTelegramMessageWithKeyboard(TELEGRAM_LESSONS_BOT_TOKEN, chatId, msg, buildLeadKeyboard(lead.id))
    : sendTelegramMessage(TELEGRAM_LESSONS_BOT_TOKEN, chatId, msg)
}

export async function notifyNewLead(lead) {
  const lines = ['🎯 <b>LEAD NOU</b>', '', ...leadDetailLines(lead)]

  const msg = lines.join('\n')

  if (!lead.id) {
    return sendTelegramMessage(
      TELEGRAM_LESSONS_BOT_TOKEN,
      TELEGRAM_ADMIN_CHAT_ID,
      msg,
      'HTML',
      TELEGRAM_ROUTES.contact
    )
  }

  const keyboard = buildLeadKeyboard(lead.id)

  return sendTelegramMessageWithKeyboard(
    TELEGRAM_LESSONS_BOT_TOKEN,
    TELEGRAM_ADMIN_CHAT_ID,
    msg,
    keyboard,
    TELEGRAM_ROUTES.contact
  )
}

/**
 * Digest zilnic cu lead-urile de recontactat — topicul Contact / Lead-uri.
 * Trimis din cron-ul de dimineață; grupează restanțele separat de cele de azi.
 * @param {Array<{lead: object, daysOverdue: number}>} items
 */
export async function notifyLeadFollowUps(items) {
  if (!items?.length) return false

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  const MAX_PER_SECTION = 25

  const line = ({ lead, daysOverdue }) => {
    const name = baseUrl
      ? `<a href="${baseUrl}/admin/leads/${lead.id}">${escapeHtml(lead.name)}</a>`
      : `<b>${escapeHtml(lead.name)}</b>`
    const parts = [name]
    if (lead.phone) parts.push(escapeHtml(lead.phone))
    if (lead.nextFollowUpAt) {
      parts.push(new Date(lead.nextFollowUpAt).toLocaleString('ro-RO', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        timeZone: 'Europe/Chisinau',
      }))
    }
    parts.push(LEAD_STATUS_LABELS[lead.status] || escapeHtml(lead.status))

    // Dacă responsabilul nu are Telegram conectat, mesajul privat nu are unde
    // ajunge — se vede aici, în loc să pară că notificarea s-a pierdut.
    const owner = lead.assignedTo?.name || lead.assignedTo?.email
    if (owner) {
      parts.push(
        lead.assignedTo.telegramChatId
          ? `resp. ${escapeHtml(owner)}`
          : `resp. ${escapeHtml(owner)} ⚠️ fără Telegram conectat`
      )
    }
    if (daysOverdue > 0) {
      parts.push(`restant de ${daysOverdue} ${daysOverdue === 1 ? 'zi' : 'zile'}`)
    }
    return `• ${parts.join(' — ')}`
  }

  const section = (title, list) => {
    if (!list.length) return []
    const shown = list.slice(0, MAX_PER_SECTION).map(line)
    if (list.length > MAX_PER_SECTION) {
      shown.push(`• …și încă ${list.length - MAX_PER_SECTION}`)
    }
    return ['', `<b>${title} (${list.length})</b>`, ...shown]
  }

  const overdue = items.filter((i) => i.daysOverdue > 0)
  const dueToday = items.filter((i) => i.daysOverdue <= 0)

  const dateLabel = new Date().toLocaleDateString('ro-RO', {
    timeZone: 'Europe/Chisinau',
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'Europe/Chisinau',
  })

  const msg = [
    `🔔 <b>LEAD-URI DE RECONTACTAT — ${dateLabel}</b>`,
    ...section('⚠️ Restante', overdue),
    ...section('📅 Azi', dueToday),
  ].join('\n')

  return sendTelegramMessage(
    TELEGRAM_LESSONS_BOT_TOKEN,
    TELEGRAM_ADMIN_CHAT_ID,
    msg,
    'HTML',
    TELEGRAM_ROUTES.contact
  )
}

/**
 * Notificare lecție anulată de profesor - Thread 4 - Lecții Neefectuate
 */
export async function notifyCancelledLesson(groupName, teacherName, levelName, scheduledTime, isRecuperare = false, studentNames = null) {
  const type = isRecuperare ? 'RECUPERARE ANULATĂ' : 'LECȚIE ANULATĂ'
  
  const message = `🚫 <b>${type}</b>

📚 Grupa: <b>${groupName}</b>
📘 Nivel: ${levelName}
👨‍🏫 Profesor: ${teacherName}
🕐 Programat: ${scheduledTime}
${studentNames ? `👥 Elevi: ${studentNames}` : ''}

⚠️ Profesorul a anulat lecția!`

  return sendTelegramMessage(
    TELEGRAM_LESSONS_BOT_TOKEN,
    TELEGRAM_ADMIN_CHAT_ID || TELEGRAM_LESSONS_CHAT_ID,
    message,
    'HTML',
    TELEGRAM_ROUTES.missedLessons
  )
}

/**
 * Conturile care primesc copie după fiecare mesaj privat trimis profesorilor
 * (orar zilnic, elev nou/eliminat, recontactări de leads). Se pot schimba din
 * TELEGRAM_SUPERVISOR_CHAT_IDS, ca listă separată prin virgulă.
 */
const SUPERVISOR_CHAT_IDS = (process.env.TELEGRAM_SUPERVISOR_CHAT_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

/**
 * Trimite mesaj direct către profesor (în privat), cu copie la supervizori.
 * Copia e marcată ca atare, ca să nu pară că e adresată lor.
 */
export async function sendTeacherDirectMessage(teacherChatId, message, recipientLabel = null, keyboard = null) {
  if (!teacherChatId) {
    console.log("Teacher has no telegramChatId configured")
    return false
  }

  const sent = keyboard
    ? await sendTelegramMessageWithKeyboard(TELEGRAM_LESSONS_BOT_TOKEN, teacherChatId, message, keyboard)
    : await sendTelegramMessage(TELEGRAM_LESSONS_BOT_TOKEN, teacherChatId, message)

  // Copiile nu blochează și nu influențează rezultatul mesajului principal
  const who = recipientLabel ? escapeHtml(recipientLabel) : `chat ${teacherChatId}`
  const copy = `📨 <i>Copie — mesaj trimis către ${who}</i>

${message}`

  await Promise.all(
    SUPERVISOR_CHAT_IDS
      .filter((id) => String(id) !== String(teacherChatId))
      .map((id) =>
        sendTelegramMessage(TELEGRAM_LESSONS_BOT_TOKEN, id, copy).catch((e) =>
          console.error("Supervisor copy failed:", e?.message)
        )
      )
  )

  return sent
}

/**
 * Notificare profesor - program zilnic (direct în privat)
 */
export async function notifyTeacherDailySchedule(teacherChatId, teacherName, lessons, dayName) {
  if (!teacherChatId || !lessons?.length) return false
  
  const lessonsText = lessons
    .map(l => `• <b>${l.time}</b> - ${l.groupName} (${l.studentsCount} elevi)`)
    .join('\n')
  
  const message = `📚 <b>Programul tău pentru ${dayName}</b>

Bună dimineața, ${teacherName}! 👋

Ai ${lessons.length} ${lessons.length === 1 ? 'lecție' : 'lecții'} azi:

${lessonsText}

🎯 Succes la ore!`

  return sendTeacherDirectMessage(teacherChatId, message, teacherName)
}

/**
 * Notificare profesor - elev nou în grupă (direct în privat)
 * @param {object} options - Opțiuni pentru notificare
 * @param {string} options.teacherChatId - Chat ID-ul profesorului
 * @param {string} options.studentName - Numele elevului
 * @param {string} options.groupName - Numele grupei
 * @param {string} options.levelName - Nivelul grupei
 * @param {string} options.scheduleDays - Zilele de curs (ex: "Luni, Miercuri")
 * @param {string} options.scheduleTime - Ora cursului
 * @param {string} options.branchName - Numele filialei
 * @param {string} options.parentPhone - Telefonul părintelui
 * @param {string} options.parentEmail - Emailul părintelui
 * @param {string} options.action - 'adăugat' sau 'transferat'
 * @param {string} options.previousTeacher - Profesorul anterior (pentru transfer)
 * @param {string} options.previousGroup - Grupa anterioară (pentru transfer)
 */
export async function notifyTeacherNewStudent(options) {
  const {
    teacherChatId,
    studentName,
    groupName,
    levelName,
    scheduleDays,
    scheduleTime,
    branchName,
    parentPhone,
    parentEmail,
    action = 'adăugat',
    previousTeacher,
    previousGroup
  } = options
  
  if (!teacherChatId) return false
  
  const emoji = action === 'transferat' ? '🔄' : '🆕'
  
  let scheduleInfo = ''
  if (scheduleDays) scheduleInfo += `\n📅 Zile: ${scheduleDays}`
  if (scheduleTime) scheduleInfo += `\n🕐 Ora: ${scheduleTime}`
  if (branchName) scheduleInfo += `\n📍 Filiala: ${branchName}`
  
  let contactInfo = ''
  if (parentPhone) contactInfo += `\n📱 Tel. părinte: ${parentPhone}`
  if (parentEmail) contactInfo += `\n📧 Email: ${parentEmail}`
  
  let transferInfo = ''
  if (action === 'transferat' && (previousTeacher || previousGroup)) {
    transferInfo = '\n\n📋 <b>Transferat din:</b>'
    if (previousGroup) transferInfo += `\n   📚 Grupa: ${previousGroup}`
    if (previousTeacher) transferInfo += `\n   👨‍🏫 Profesor: ${previousTeacher}`
  }
  
  const message = `${emoji} <b>Elev ${action} în grupă</b>

👤 Elev: <b>${studentName}</b>
📚 Grupa: ${groupName}
📘 Nivel: ${levelName}${scheduleInfo}${contactInfo}${transferInfo}

📝 Verifică lista de prezență la următoarea lecție!`

  return sendTeacherDirectMessage(teacherChatId, message, options.teacherName || null)
}

/**
 * Notificare profesor - elev eliminat/transferat din grupă (direct în privat)
 * @param {object} options - Opțiuni pentru notificare
 */
export async function notifyTeacherStudentRemoved(options) {
  const {
    teacherChatId,
    studentName,
    groupName,
    targetGroup,
    targetTeacher,
    isTransfer = false
  } = options
  
  if (!teacherChatId) return false
  
  let transferInfo = ''
  if (isTransfer && (targetGroup || targetTeacher)) {
    transferInfo = '\n\n📋 <b>Transferat în:</b>'
    if (targetGroup) transferInfo += `\n   📚 Grupa: ${targetGroup}`
    if (targetTeacher) transferInfo += `\n   👨‍🏫 Profesor: ${targetTeacher}`
  }
  
  const emoji = isTransfer ? '🔄' : '👋'
  const title = isTransfer ? 'Elev transferat din grupă' : 'Elev eliminat din grupă'
  
  const message = `${emoji} <b>${title}</b>

👤 Elev: <b>${studentName}</b>
📚 Grupa: ${groupName}${transferInfo}

📝 Elevul nu va mai apărea în lista de prezență.`

  return sendTeacherDirectMessage(teacherChatId, message, options.teacherName || null)
}

export { sendTelegramMessage }

