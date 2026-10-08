import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SCHOOL_TZ, zonedToUtcISO, utcToZonedParts } from '@/lib/timezone'
import { SALARY_PERMS, salaryAccess } from '@/lib/salary-access'
import { NOT_COMPLETED } from '@/lib/group-filters'

/**
 * Salariile profesorilor.
 *
 * Fiecare sumă e un rând în SalaryEntry: lecțiile ținute intră singure (după
 * regula grupei — sumă fixă sau pe elev prezent), restul le pune adminul din
 * pagina Salarii: bonusuri, corectări, salariul scos. Soldul profesorului e
 * simplu suma rândurilor nesterse, deci nu există o cifră separată care să
 * poată rămâne în urmă.
 *
 * Profesorul află de fiecare mișcare cu motivul ei: în privat pe Telegram și
 * în notificările din CRM.
 */

const LESSONS_BOT_TOKEN = process.env.TELEGRAM_LESSONS_BOT_TOKEN

export { SALARY_PERMS, salaryAccess }

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

/** Liniile de detaliu ale unui rând, pentru mesajul de Telegram. */
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

// ── Mesajul către profesor ─────────────────────────────────

const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/**
 * Profesorul află de fiecare sumă: în privat pe Telegram (botul obișnuit,
 * fără copie la supervizori — e salariul lui) și în notificările din CRM.
 * Doar cei cu „Salariul meu" activat; sumele se înregistrează oricum, iar
 * activarea de mai târziu arată tot istoricul.
 */
async function notifyEntry(entry, header = null) {
  try {
    const teacher = await prisma.user.findUnique({
      where: { id: entry.teacherId },
      select: { telegramChatId: true, role: true, permissions: true },
    })
    if (!teacher || !salaryAccess(teacher).own) return

    const balance = await getBalance(entry.teacherId)
    const balanceLine = `💼 Sold de primit: <b>${fmtBalance(balance)}</b>`
    const text = [...(header ? [header, ''] : []), entryText(entry), '', balanceLine].join('\n')

    const telegram = teacher.telegramChatId && LESSONS_BOT_TOKEN
      ? fetch(`https://api.telegram.org/bot${LESSONS_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: teacher.telegramChatId,
            text,
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
          }),
        }).catch((err) => console.error('[salary] Telegram:', err.message))
      : null

    const inApp = prisma.notification.create({
      data: {
        type: 'SALARY_UPDATE',
        recipientId: entry.teacherId,
        groupId: entry.groupId || null,
        title: stripHtml(header) || `${fmtSigned(entry.amount)} · ${entry.reason}`,
        message: [
          ...(header ? [`${fmtSigned(entry.amount)} · ${entry.reason}`] : []),
          ...entryDetailLines(entry).map(stripHtml),
          stripHtml(balanceLine),
        ].join('\n'),
        link: '/teacher/salary',
        data: { entryId: entry.id, amount: entry.amount },
      },
    })

    await Promise.all([telegram, inApp])
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

// ── Operații manuale (din pagina Salarii) ──────────────────

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

// ── Date pentru pagini ─────────────────────────────────────

const ENTRY_LIMIT = 1000

/** Toți cei care țin lecții sau au avut vreodată ceva în salariu. */
async function salaryTeachers(extraIds = []) {
  return prisma.user.findMany({
    where: {
      OR: [
        { role: 'TEACHER', active: true },
        { teacherGroups: { some: { active: true } } },
        ...(extraIds.length ? [{ id: { in: extraIds } }] : []),
      ],
    },
    select: { id: true, name: true, email: true, role: true, permissions: true, telegramChatId: true, active: true },
    orderBy: { name: 'asc' },
  })
}

/** Pagina Salarii: fiecare profesor cu soldul și cifrele lunii alese. */
export async function salaryOverview(month = currentMonth()) {
  const [sums, monthEntries] = await Promise.all([
    prisma.salaryEntry.groupBy({ by: ['teacherId'], where: ACTIVE, _sum: { amount: true } }),
    prisma.salaryEntry.findMany({
      where: { ...ACTIVE, date: monthRange(month) },
      select: { teacherId: true, kind: true, amount: true },
    }),
  ])
  const balances = new Map(sums.map((s) => [s.teacherId, round2(s._sum.amount || 0)]))
  const teachers = await salaryTeachers([...balances.keys()])

  const byTeacher = new Map()
  for (const e of monthEntries) {
    if (!byTeacher.has(e.teacherId)) byTeacher.set(e.teacherId, [])
    byTeacher.get(e.teacherId).push(e)
  }

  const rows = teachers.map((t) => ({
    id: t.id,
    name: t.name || t.email,
    active: t.active,
    hasTelegram: !!t.telegramChatId,
    notified: salaryAccess(t).own,
    balance: balances.get(t.id) || 0,
    month: summarize(byTeacher.get(t.id) || []),
  }))

  return {
    month,
    rows,
    totals: {
      balance: round2(rows.reduce((sum, r) => sum + r.balance, 0)),
      month: summarize(monthEntries),
    },
  }
}

export async function recentEntries(limit = 30) {
  return prisma.salaryEntry.findMany({
    where: ACTIVE,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

/**
 * Fișa unui profesor: soldul, luna curentă, de la început, grupele cu regula
 * lor și rândurile perioadei alese (o lună sau tot istoricul).
 */
export async function teacherSalaryDetail(teacherId, period = currentMonth(), { includeDeleted = false } = {}) {
  const where = {
    teacherId,
    ...(includeDeleted ? {} : ACTIVE),
    ...(period ? { date: monthRange(period) } : {}),
  }
  const [teacher, stats, entries, groups] = await Promise.all([
    prisma.user.findUnique({
      where: { id: teacherId },
      select: { id: true, name: true, email: true, role: true, permissions: true, telegramChatId: true },
    }),
    teacherStats(teacherId, currentMonth()),
    prisma.salaryEntry.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: ENTRY_LIMIT,
    }),
    prisma.group.findMany({
      where: { teacherId, active: true, ...NOT_COMPLETED },
      select: { id: true, name: true, salaryType: true, salaryAmount: true },
      orderBy: { name: 'asc' },
    }),
  ])
  if (!teacher) return null

  return {
    teacher: {
      id: teacher.id,
      name: teacher.name || teacher.email,
      hasTelegram: !!teacher.telegramChatId,
      notified: salaryAccess(teacher).own,
    },
    stats,
    period: period ? { ...period, key: monthKey(period), label: monthLabel(period) } : null,
    periodSummary: summarize(entries.filter((e) => !e.deleted)),
    entries,
    truncated: entries.length === ENTRY_LIMIT,
    groups,
  }
}

// ── Cine cere ──────────────────────────────────────────────

/**
 * Utilizatorul curent și ce poate face cu salariile. Drepturile se citesc
 * din bază, nu din sesiune — o permisiune scoasă contează imediat.
 */
export async function currentSalaryUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, permissions: true, active: true },
  })
  if (!user?.active) return null
  return { user, access: salaryAccess(user), actor: { id: user.id, name: user.name || user.email } }
}

/** „202610" → { year, month }; „all" → null (tot istoricul). */
export function parsePeriod(value) {
  if (value === 'all') return null
  return parseMonthKey(value) || currentMonth()
}

/**
 * Suma și motivul trimise din formular, după tipul rândului. Întoarce
 * { amount, reason } gata de salvat sau { error }.
 */
export function validateManualAmount(kind, rawAmount, rawReason) {
  const amount = round2(parseFloat(String(rawAmount ?? '').replace(',', '.')))
  const reason = String(rawReason ?? '').trim().slice(0, 300)
  if (!Number.isFinite(amount)) return { error: 'Suma nu e validă' }
  if (Math.abs(amount) > 1_000_000) return { error: 'Suma e prea mare' }

  if (kind === 'PAYOUT') {
    if (amount === 0) return { error: 'Suma trebuie să fie mai mare ca 0' }
    return { amount: -Math.abs(amount), reason: reason || 'Salariu' }
  }
  if (kind === 'ADJUSTMENT') {
    if (amount === 0) return { error: 'Suma nu poate fi 0' }
    if (!reason) return { error: 'Scrie motivul corectării' }
    return { amount, reason }
  }
  if (amount <= 0) return { error: 'Suma trebuie să fie mai mare ca 0' }
  return { amount, reason: reason || (kind === 'BONUS' ? 'Bonus' : '') }
}
