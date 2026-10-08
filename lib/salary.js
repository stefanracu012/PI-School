import prisma from '@/lib/prisma'
import { SCHOOL_TZ, zonedToUtcISO, utcToZonedParts } from '@/lib/timezone'

/**
 * Salariile profesorilor.
 *
 * Fiecare sumă e un rând în SalaryEntry: lecțiile ținute intră singure (după
 * regula grupei — sumă fixă sau pe elev prezent), restul le pune adminul din
 * botul de salarii: bonusuri, corectări, salariul scos. Soldul profesorului e
 * simplu suma rândurilor nesterse, deci nu există o cifră separată care să
 * poată rămâne în urmă.
 *
 * Profesorul află de fiecare mișcare în privat, cu motivul ei.
 */

const SALARY_BOT_TOKEN = process.env.TELEGRAM_SALARY_BOT_TOKEN
const LESSONS_BOT_TOKEN = process.env.TELEGRAM_LESSONS_BOT_TOKEN

export const SALARY_PERMISSION = 'salaries.manage'

export const KIND_LABELS = {
  LESSON: 'Lecție',
  MAKEUP: 'Recuperare',
  BONUS: 'Bonus',
  PAYOUT: 'Salariu achitat',
  ADJUSTMENT: 'Corectare',
}

const KIND_EMOJI = {
  LESSON: '📚',
  MAKEUP: '🔁',
  BONUS: '🎁',
  PAYOUT: '💸',
  ADJUSTMENT: '✏️',
}

export const MONTHS_RO = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
]

export const escapeHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100

export function fmtLei(n) {
  return `${round2(Math.abs(n)).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} lei`
}

export function fmtSigned(n) {
  const v = round2(n)
  return `${v < 0 ? '−' : '+'}${fmtLei(v)}`
}

/** Soldul afișat: fără plus, dar cu minus dacă profesorul a primit mai mult decât a câștigat. */
export function fmtBalance(n) {
  const v = round2(n)
  return `${v < 0 ? '−' : ''}${fmtLei(v)}`
}

export function fmtDateTime(date) {
  const d = new Date(date)
  const day = d.toLocaleDateString('ro-RO', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: SCHOOL_TZ,
  })
  const time = d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: SCHOOL_TZ })
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${time}`
}

export function fmtShort(date) {
  return new Date(date).toLocaleString('ro-RO', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: SCHOOL_TZ,
  })
}

// ── Luni, în fusul școlii ──────────────────────────────────

/** Luna curentă la Chișinău, ca { year, month } (month 1–12). */
export function currentMonth() {
  const [y, m] = utcToZonedParts(new Date().toISOString()).date.split('-').map(Number)
  return { year: y, month: m }
}

export function shiftMonth({ year, month }, delta) {
  const idx = year * 12 + (month - 1) + delta
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

export function monthRange({ year, month }) {
  const next = shiftMonth({ year, month }, 1)
  const pad = (n) => String(n).padStart(2, '0')
  return {
    gte: new Date(zonedToUtcISO(`${year}-${pad(month)}-01`, 0, 0)),
    lt: new Date(zonedToUtcISO(`${next.year}-${pad(next.month)}-01`, 0, 0)),
  }
}

export const monthLabel = ({ year, month }) => `${MONTHS_RO[month - 1]} ${year}`
export const monthKey = ({ year, month }) => `${year}${String(month).padStart(2, '0')}`
export function parseMonthKey(key) {
  if (!/^\d{6}$/.test(key || '')) return null
  const month = Number(key.slice(4))
  if (month < 1 || month > 12) return null
  return { year: Number(key.slice(0, 4)), month }
}

// ── Calcul ─────────────────────────────────────────────────

export function computeLessonPay(salaryType, rate, presentCount) {
  if (!salaryType || !(rate > 0)) return 0
  return round2(salaryType === 'PER_PRESENCE' ? rate * presentCount : rate)
}

export function salaryRuleLabel(salaryType, rate) {
  if (!salaryType || !(rate > 0)) return 'nesetat'
  return salaryType === 'PER_PRESENCE'
    ? `${fmtLei(rate)} pe elev prezent`
    : `${fmtLei(rate)} fix pe lecție`
}

/**
 * Regula de salariu trimisă din formularul grupei → câmpurile pentru Prisma.
 * Fără tip sau fără sumă pozitivă, grupa rămâne fără regulă (nu adaugă nimic).
 */
export function parseGroupSalary(body) {
  if (body?.salaryType === undefined && body?.salaryAmount === undefined) return {}
  const type = ['FIXED', 'PER_PRESENCE'].includes(body.salaryType) ? body.salaryType : null
  const amount = parseFloat(String(body.salaryAmount ?? '').replace(',', '.'))
  if (!type || !(amount > 0)) return { salaryType: null, salaryAmount: null }
  return { salaryType: type, salaryAmount: round2(amount) }
}

const ACTIVE = { deleted: false }

export async function getBalance(teacherId) {
  const agg = await prisma.salaryEntry.aggregate({
    where: { teacherId, ...ACTIVE },
    _sum: { amount: true },
  })
  return round2(agg._sum.amount || 0)
}

/** Totalurile unui set de rânduri: cât a câștigat, cât i s-a achitat, câte lecții. */
export function summarize(entries) {
  let earned = 0
  let paid = 0
  let lessons = 0
  let bonuses = 0
  for (const e of entries) {
    if (e.kind === 'PAYOUT') paid -= e.amount
    else earned += e.amount
    if (e.kind === 'LESSON' || e.kind === 'MAKEUP') lessons++
    if (e.kind === 'BONUS') bonuses++
  }
  return { earned: round2(earned), paid: round2(paid), lessons, bonuses }
}

export async function teacherStats(teacherId, month = currentMonth()) {
  const [all, inMonth] = await Promise.all([
    prisma.salaryEntry.findMany({
      where: { teacherId, ...ACTIVE },
      select: { kind: true, amount: true },
    }),
    prisma.salaryEntry.findMany({
      where: { teacherId, ...ACTIVE, date: monthRange(month) },
      select: { kind: true, amount: true },
    }),
  ])
  const total = summarize(all)
  return {
    balance: round2(total.earned - total.paid),
    total,
    month: summarize(inMonth),
  }
}

// ── Textul unui rând ───────────────────────────────────────

/** Liniile de detaliu ale unui rând — aceleași în notificare și în bot. */
export function entryDetailLines(entry) {
  const lines = []
  if (entry.kind === 'LESSON' || entry.kind === 'MAKEUP') {
    if (entry.salaryType === 'PER_PRESENCE') {
      lines.push(`👥 ${entry.presentCount ?? 0}/${entry.studentsCount ?? 0} elevi prezenți × ${fmtLei(entry.rate)}`)
    } else if (entry.salaryType === 'FIXED') {
      lines.push(`📌 Sumă fixă pe lecție${entry.studentsCount ? ` · ${entry.presentCount ?? 0}/${entry.studentsCount} prezenți` : ''}`)
    }
  }
  lines.push(`📅 ${fmtDateTime(entry.date)}`)
  if (entry.createdByName && entry.kind !== 'LESSON' && entry.kind !== 'MAKEUP') {
    lines.push(`✍️ ${escapeHtml(entry.createdByName)}`)
  }
  if (entry.editedAt) {
    lines.push(`✏️ Editat${entry.editedByName ? ` de ${escapeHtml(entry.editedByName)}` : ''}, ${fmtShort(entry.editedAt)}`)
  }
  return lines
}

export function entryHeadline(entry) {
  return `${KIND_EMOJI[entry.kind] || '•'} <b>${fmtSigned(entry.amount)}</b>`
}

export function entryText(entry) {
  return [
    entryHeadline(entry),
    `<b>${escapeHtml(entry.reason)}</b>`,
    ...entryDetailLines(entry),
  ].join('\n')
}

// ── Telegram ───────────────────────────────────────────────

export async function callSalaryBot(method, payload, token = SALARY_BOT_TOKEN) {
  if (!token) return null
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!data.ok) console.error(`[salary-bot/${method}] ${data.error_code}: ${data.description}`)
    return data
  } catch (err) {
    console.error(`[salary-bot/${method}] fetch failed:`, err.message)
    return null
  }
}

/**
 * Mesaj privat către profesor. Merge prin botul de salarii; dacă profesorul
 * nu l-a pornit încă (Telegram refuză), îl primește prin botul obișnuit,
 * ca să nu rămână fără vestea că i s-a mișcat salariul.
 */
async function sendToTeacher(teacherId, text) {
  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { telegramChatId: true },
  })
  if (!teacher?.telegramChatId) return false

  const payload = {
    chat_id: teacher.telegramChatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  }
  const viaSalary = await callSalaryBot('sendMessage', payload)
  if (viaSalary?.ok) return true
  const viaLessons = await callSalaryBot('sendMessage', payload, LESSONS_BOT_TOKEN)
  return !!viaLessons?.ok
}

async function notifyEntry(entry, header = null) {
  try {
    const balance = await getBalance(entry.teacherId)
    const text = [
      ...(header ? [header, ''] : []),
      entryText(entry),
      '',
      `💼 Sold de primit: <b>${fmtBalance(balance)}</b>`,
    ].join('\n')
    await sendToTeacher(entry.teacherId, text)
  } catch (err) {
    console.error('[salary] notificarea profesorului a eșuat:', err.message)
  }
}

// ── Lecții ținute: se adaugă singure ───────────────────────

/**
 * Pune (sau aduce la zi) rândul de salariu al unei lecții/recuperări.
 * Se apelează după salvare și după fiecare corectare a prezenței — e
 * idempotent: o lecție are cel mult un rând activ.
 */
async function syncAutoEntry({ kind, source, existing, teacherId, teacherName, group, date, present, total }) {
  if (existing) {
    // Adminul a pus suma de mână — corectările de prezență nu o mai ating
    if (existing.manual) return existing

    const amount = computeLessonPay(existing.salaryType, existing.rate, present)
    const sameDate = +new Date(existing.date) === +new Date(date)
    if (amount === existing.amount && existing.presentCount === present && existing.studentsCount === total && sameDate) {
      return existing
    }

    if (amount <= 0) {
      const removed = await prisma.salaryEntry.update({
        where: { id: existing.id },
        data: { deleted: true, deletedAt: new Date(), deletedByName: 'Prezență corectată' },
      })
      await notifyEntry(removed, `🗑 <b>Suma pentru lecție a fost scoasă</b> — nu a mai rămas niciun elev prezent.`)
      return null
    }

    const updated = await prisma.salaryEntry.update({
      where: { id: existing.id },
      data: { amount, presentCount: present, studentsCount: total, date },
    })
    if (amount !== existing.amount) {
      await notifyEntry(updated, `✏️ <b>Prezența a fost corectată</b> — era ${fmtSigned(existing.amount)}`)
    }
    return updated
  }

  const amount = computeLessonPay(group.salaryType, group.salaryAmount, present)
  if (amount <= 0) return null

  const entry = await prisma.salaryEntry.create({
    data: {
      teacherId,
      teacherName: teacherName || null,
      kind,
      amount,
      reason: `${kind === 'MAKEUP' ? 'Recuperare' : 'Lecție'} cu grupa ${group.name}`,
      date,
      groupId: group.id,
      groupName: group.name,
      ...source,
      salaryType: group.salaryType,
      rate: group.salaryAmount,
      presentCount: present,
      studentsCount: total,
    },
  })
  await notifyEntry(entry)
  return entry
}

const groupSalarySelect = {
  id: true, name: true, teacherId: true, salaryType: true, salaryAmount: true,
  teacher: { select: { name: true } },
}

export async function syncSessionSalary(sessionId) {
  try {
    const session = await prisma.lessonSession.findUnique({
      where: { id: sessionId },
      include: {
        group: { select: groupSalarySelect },
        attendances: { select: { status: true } },
      },
    })
    if (!session?.lessonsDeducted || !session.group) return null

    const existing = await prisma.salaryEntry.findFirst({ where: { sessionId, ...ACTIVE } })
    return await syncAutoEntry({
      kind: 'LESSON',
      source: { sessionId },
      existing,
      teacherId: existing?.teacherId || session.group.teacherId,
      teacherName: session.group.teacher?.name,
      group: session.group,
      date: session.date,
      present: session.attendances.filter((a) => a.status === 'PRESENT').length,
      total: session.attendances.length,
    })
  } catch (err) {
    console.error('[salary] syncSessionSalary:', err)
    return null
  }
}

export async function syncMakeupSalary(makeupId) {
  try {
    const makeup = await prisma.makeupLesson.findUnique({
      where: { id: makeupId },
      include: {
        group: { select: groupSalarySelect },
        teacher: { select: { name: true } },
        students: { select: { status: true } },
      },
    })
    if (!makeup?.lessonsDeducted || makeup.status !== 'COMPLETED' || !makeup.group) return null

    const existing = await prisma.salaryEntry.findFirst({ where: { makeupId, ...ACTIVE } })
    return await syncAutoEntry({
      kind: 'MAKEUP',
      source: { makeupId },
      existing,
      teacherId: existing?.teacherId || makeup.teacherId,
      teacherName: makeup.teacher?.name,
      group: makeup.group,
      date: makeup.scheduledAt,
      present: makeup.students.filter((s) => s.status === 'PRESENT').length,
      total: makeup.students.length,
    })
  } catch (err) {
    console.error('[salary] syncMakeupSalary:', err)
    return null
  }
}

/** Lecția/recuperarea s-a șters din CRM — suma ei iese din salariu. */
export async function removeSourceSalary({ sessionId, makeupId }, actorName = null) {
  try {
    const where = sessionId ? { sessionId } : makeupId ? { makeupId } : null
    if (!where) return
    const entries = await prisma.salaryEntry.findMany({ where: { ...where, ...ACTIVE } })
    for (const entry of entries) {
      const removed = await prisma.salaryEntry.update({
        where: { id: entry.id },
        data: { deleted: true, deletedAt: new Date(), deletedByName: actorName || 'Lecție ștearsă' },
      })
      await notifyEntry(removed, `🗑 <b>Lecția a fost ștearsă din sistem — suma de ${fmtSigned(entry.amount)} a fost scoasă</b>`)
    }
  } catch (err) {
    console.error('[salary] removeSourceSalary:', err)
  }
}

// ── Operații manuale (din botul de salarii) ────────────────

export async function addManualEntry({ teacherId, kind, amount, reason, actor }) {
  const teacher = await prisma.user.findUnique({ where: { id: teacherId }, select: { name: true, email: true } })
  if (!teacher) throw new Error('Profesorul nu există')

  const entry = await prisma.salaryEntry.create({
    data: {
      teacherId,
      teacherName: teacher.name || teacher.email,
      kind,
      amount: round2(amount),
      reason,
      date: new Date(),
      manual: true,
      createdById: actor?.id || null,
      createdByName: actor?.name || null,
    },
  })
  await notifyEntry(entry)
  return entry
}

export async function editEntry(entryId, { amount, reason }, actor) {
  const before = await prisma.salaryEntry.findUnique({ where: { id: entryId } })
  if (!before || before.deleted) throw new Error('Rândul nu mai există')

  const entry = await prisma.salaryEntry.update({
    where: { id: entryId },
    data: {
      ...(amount != null ? { amount: round2(amount) } : {}),
      ...(reason ? { reason } : {}),
      manual: true,
      editedAt: new Date(),
      editedByName: actor?.name || null,
    },
  })
  const header = entry.amount !== before.amount
    ? `✏️ <b>Sumă corectată</b> — era ${fmtSigned(before.amount)}`
    : '✏️ <b>Motiv corectat</b>'
  await notifyEntry(entry, header)
  return { before, entry }
}

export async function deleteEntry(entryId, actor) {
  const before = await prisma.salaryEntry.findUnique({ where: { id: entryId } })
  if (!before || before.deleted) throw new Error('Rândul nu mai există')

  const entry = await prisma.salaryEntry.update({
    where: { id: entryId },
    data: { deleted: true, deletedAt: new Date(), deletedByName: actor?.name || null },
  })
  await notifyEntry(entry, `🗑 <b>Anulat${actor?.name ? ` de ${escapeHtml(actor.name)}` : ''}</b> — suma nu mai contează în salariu`)
  return entry
}
