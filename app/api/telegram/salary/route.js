import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { NOT_COMPLETED } from '@/lib/group-filters'
import { utcToZonedParts } from '@/lib/timezone'
import {
  SALARY_PERMISSION,
  KIND_LABELS,
  callSalaryBot,
  escapeHtml,
  fmtLei,
  fmtSigned,
  fmtBalance,
  fmtShort,
  entryText,
  currentMonth,
  shiftMonth,
  monthRange,
  monthLabel,
  monthKey,
  parseMonthKey,
  summarize,
  teacherStats,
  getBalance,
  salaryRuleLabel,
  addManualEntry,
  editEntry,
  deleteEntry,
} from '@/lib/salary'

/**
 * Botul de salarii.
 *
 * Adminii cu dreptul „Gestionează salariile" (și superadminii) văd toți
 * profesorii: soldul, istoricul pe luni și de la început, fiecare sumă cu
 * grupa, ziua și ora. De aici pun bonusuri, corectează, anulează și scot
 * salariul. Profesorul care scrie botului își vede doar salariul lui.
 *
 * Cine e cine se află după contul de Telegram conectat în CRM: chat ID-ul
 * unei conversații private e același pentru toți boții.
 */

export const runtime = 'nodejs'
export const maxDuration = 10

const BOT_TOKEN = process.env.TELEGRAM_SALARY_BOT_TOKEN
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET

const HISTORY_PAGE = 8
const TEACHERS_PAGE = 20
const RECENT_PAGE = 10
const STATE_TTL_MIN = 15
const MAX_AMOUNT = 1_000_000

const OBJECT_ID = /^[a-f0-9]{24}$/

const tg = (method, payload) => callSalaryBot(method, payload)

const btn = (text, data) => ({ text, callback_data: data })

const isSalaryAdmin = (u) =>
  u?.role === 'SUPERADMIN' || (u?.role === 'ADMIN' && (u.permissions || []).includes(SALARY_PERMISSION))

async function findUser(telegramUserId) {
  return prisma.user.findFirst({
    where: { telegramChatId: String(telegramUserId), active: true },
    select: { id: true, name: true, email: true, role: true, permissions: true },
  })
}

const displayName = (u) => u?.name || u?.email || '—'

async function send(chatId, view) {
  return tg('sendMessage', {
    chat_id: chatId,
    text: view.text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: view.keyboard ? { inline_keyboard: view.keyboard } : undefined,
  })
}

async function edit(chatId, messageId, view) {
  const res = await tg('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: view.text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: view.keyboard ? { inline_keyboard: view.keyboard } : undefined,
  })
  // Mesajele vechi (peste 48h) nu se mai pot edita — trimitem unul nou
  if (res && !res.ok && !/not modified/i.test(res.description || '')) {
    return send(chatId, view)
  }
  return res
}

// ============================================
// ECRANE
// ============================================

async function adminHome() {
  const month = currentMonth()
  const [totalAgg, inMonth] = await Promise.all([
    prisma.salaryEntry.aggregate({ where: { deleted: false }, _sum: { amount: true } }),
    prisma.salaryEntry.findMany({
      where: { deleted: false, date: monthRange(month) },
      select: { kind: true, amount: true },
    }),
  ])
  const m = summarize(inMonth)

  return {
    text: [
      '💼 <b>Salarii profesori</b>',
      '',
      `💰 De achitat, în total: <b>${fmtBalance(totalAgg._sum.amount || 0)}</b>`,
      '',
      `📅 <b>${monthLabel(month)}</b>`,
      `Câștigat: <b>${fmtLei(m.earned)}</b> (${m.lessons} lecții)`,
      `Achitat: <b>${fmtLei(m.paid)}</b>`,
    ].join('\n'),
    keyboard: [
      [btn('👨‍🏫 Profesori', 's:tl:0')],
      [btn('🕐 Ultimele mișcări', 's:r:0')],
      [btn(`📅 ${monthLabel(month)} pe profesori`, `s:mo:${monthKey(month)}`)],
    ],
  }
}

async function teacherIdsWithBalance() {
  const sums = await prisma.salaryEntry.groupBy({
    by: ['teacherId'],
    where: { deleted: false },
    _sum: { amount: true },
  })
  return new Map(sums.map((s) => [s.teacherId, s._sum.amount || 0]))
}

async function teacherList(page) {
  const balances = await teacherIdsWithBalance()
  const teachers = await prisma.user.findMany({
    where: {
      OR: [
        { role: 'TEACHER', active: true },
        { teacherGroups: { some: { active: true } } },
        { id: { in: [...balances.keys()] } },
      ],
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })

  const pages = Math.max(1, Math.ceil(teachers.length / TEACHERS_PAGE))
  const p = Math.min(Math.max(0, page), pages - 1)
  const shown = teachers.slice(p * TEACHERS_PAGE, (p + 1) * TEACHERS_PAGE)

  const keyboard = shown.map((t) => [
    btn(`${displayName(t)} · ${fmtBalance(balances.get(t.id) || 0)}`, `s:t:${t.id}`),
  ])
  const nav = []
  if (p > 0) nav.push(btn('⬅️', `s:tl:${p - 1}`))
  if (p < pages - 1) nav.push(btn('➡️', `s:tl:${p + 1}`))
  if (nav.length) keyboard.push(nav)
  keyboard.push([btn('🏠 Meniu', 's:menu')])

  return {
    text: [
      '👨‍🏫 <b>Profesori</b>',
      '',
      'Lângă nume e soldul de achitat. Alege un profesor ca să vezi istoricul și să adaugi sau să scoți bani.',
      ...(pages > 1 ? ['', `Pagina ${p + 1}/${pages}`] : []),
    ].join('\n'),
    keyboard,
  }
}

async function teacherCard(teacherId, viewerIsAdmin) {
  const month = currentMonth()
  const [teacher, stats, groups] = await Promise.all([
    prisma.user.findUnique({
      where: { id: teacherId },
      select: { id: true, name: true, email: true, telegramChatId: true },
    }),
    teacherStats(teacherId, month),
    prisma.group.findMany({
      where: { teacherId, active: true, ...NOT_COMPLETED },
      select: { name: true, salaryType: true, salaryAmount: true },
      orderBy: { name: 'asc' },
    }),
  ])
  if (!teacher) return { text: '❌ Profesorul nu mai există.', keyboard: [[btn('🏠 Meniu', 's:menu')]] }

  const lines = [
    `👨‍🏫 <b>${escapeHtml(displayName(teacher))}</b>`,
    '',
    `💼 Sold de primit: <b>${fmtBalance(stats.balance)}</b>`,
    '',
    `📅 <b>${monthLabel(month)}</b>`,
    `Câștigat: <b>${fmtLei(stats.month.earned)}</b> (${stats.month.lessons} lecții${stats.month.bonuses ? `, ${stats.month.bonuses} bonusuri` : ''})`,
    `Achitat: <b>${fmtLei(stats.month.paid)}</b>`,
    '',
    '📊 <b>De la început</b>',
    `Câștigat: ${fmtLei(stats.total.earned)} (${stats.total.lessons} lecții)`,
    `Achitat: ${fmtLei(stats.total.paid)}`,
  ]

  if (groups.length) {
    lines.push('', '📚 <b>Grupe și plata pe lecție</b>')
    for (const g of groups) {
      lines.push(`• ${escapeHtml(g.name)} — ${salaryRuleLabel(g.salaryType, g.salaryAmount)}`)
    }
    if (viewerIsAdmin && groups.some((g) => !g.salaryType || !(g.salaryAmount > 0))) {
      lines.push('<i>Grupele „nesetat” nu adaugă nimic la salariu — se setează din CRM, la editarea grupei.</i>')
    }
  }

  if (viewerIsAdmin && !teacher.telegramChatId) {
    lines.push('', '⚠️ <i>Profesorul nu are Telegram conectat — nu primește mesajele despre salariu.</i>')
  }

  const key = monthKey(month)
  const keyboard = [
    [btn(`📜 ${monthLabel(month)}`, `s:h:${teacherId}:${key}:0`), btn('📚 Tot istoricul', `s:h:${teacherId}:all:0`)],
  ]
  if (viewerIsAdmin) {
    keyboard.push([btn('🎁 Bonus', `s:b:${teacherId}`), btn('✏️ Corectare ±', `s:a:${teacherId}`)])
    keyboard.push([btn('💸 Scoate salariul', `s:p:${teacherId}`)])
    keyboard.push([btn('⬅️ Profesori', 's:tl:0'), btn('🏠 Meniu', 's:menu')])
  }

  return { text: lines.join('\n'), keyboard }
}

/** Rândul scurt din liste: suma mare, restul dedesubt. */
function entryLine(entry, index, withTeacher = false) {
  const details = []
  if (withTeacher && entry.teacherName) details.push(escapeHtml(entry.teacherName))
  details.push(escapeHtml(entry.reason))
  if ((entry.kind === 'LESSON' || entry.kind === 'MAKEUP') && entry.studentsCount) {
    details.push(`${entry.presentCount ?? 0}/${entry.studentsCount} prezenți`)
  }
  return [
    `<b>${index}.</b> <b>${fmtSigned(entry.amount)}</b> · ${fmtShort(entry.date)}`,
    `     ${KIND_LABELS[entry.kind]} — ${details.join(' · ')}`,
  ].join('\n')
}

function entryButtons(entries, startIndex) {
  const rows = []
  for (let i = 0; i < entries.length; i += 4) {
    rows.push(
      entries.slice(i, i + 4).map((e, j) => btn(`✏️ ${startIndex + i + j}`, `s:e:${e.id}`))
    )
  }
  return rows
}

async function history(teacherId, key, page, viewerIsAdmin) {
  const month = key === 'all' ? null : parseMonthKey(key)
  const where = { teacherId, deleted: false, ...(month ? { date: monthRange(month) } : {}) }

  const [teacher, count, entries, all] = await Promise.all([
    prisma.user.findUnique({ where: { id: teacherId }, select: { name: true, email: true } }),
    prisma.salaryEntry.count({ where }),
    prisma.salaryEntry.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: page * HISTORY_PAGE,
      take: HISTORY_PAGE,
    }),
    prisma.salaryEntry.findMany({ where, select: { kind: true, amount: true } }),
  ])

  const s = summarize(all)
  const pages = Math.max(1, Math.ceil(count / HISTORY_PAGE))
  const title = month ? monthLabel(month) : 'tot istoricul'

  const lines = [
    `📜 <b>${escapeHtml(displayName(teacher))} — ${title}</b>`,
    `Câștigat: <b>${fmtLei(s.earned)}</b> · Achitat: <b>${fmtLei(s.paid)}</b>`,
  ]
  if (!month) lines.push(`Sold: <b>${fmtBalance(s.earned - s.paid)}</b>`)
  lines.push('')

  if (!entries.length) {
    lines.push('<i>Nicio sumă în perioada aceasta.</i>')
  } else {
    entries.forEach((e, i) => lines.push(entryLine(e, page * HISTORY_PAGE + i + 1), ''))
    if (pages > 1) lines.push(`Pagina ${page + 1}/${pages}`)
  }

  const keyboard = viewerIsAdmin ? entryButtons(entries, page * HISTORY_PAGE + 1) : []

  const pageNav = []
  if (page > 0) pageNav.push(btn('⬅️ Mai noi', `s:h:${teacherId}:${key}:${page - 1}`))
  if (page < pages - 1) pageNav.push(btn('Mai vechi ➡️', `s:h:${teacherId}:${key}:${page + 1}`))
  if (pageNav.length) keyboard.push(pageNav)

  if (month) {
    const prev = shiftMonth(month, -1)
    const next = shiftMonth(month, 1)
    const monthNav = [btn(`◀️ ${monthLabel(prev)}`, `s:h:${teacherId}:${monthKey(prev)}:0`)]
    if (monthKey(next) <= monthKey(currentMonth())) {
      monthNav.push(btn(`${monthLabel(next)} ▶️`, `s:h:${teacherId}:${monthKey(next)}:0`))
    }
    keyboard.push(monthNav)
  }

  keyboard.push([btn('⬅️ Înapoi', `s:t:${teacherId}`)])
  return { text: lines.join('\n'), keyboard }
}

async function recent(page) {
  const [count, entries] = await Promise.all([
    prisma.salaryEntry.count({ where: { deleted: false } }),
    prisma.salaryEntry.findMany({
      where: { deleted: false },
      orderBy: { createdAt: 'desc' },
      skip: page * RECENT_PAGE,
      take: RECENT_PAGE,
    }),
  ])
  const pages = Math.max(1, Math.ceil(count / RECENT_PAGE))

  const lines = ['🕐 <b>Ultimele mișcări</b>', '<i>Cele mai noi sus, la toți profesorii.</i>', '']
  if (!entries.length) lines.push('<i>Nu e încă nimic.</i>')
  entries.forEach((e, i) => lines.push(entryLine(e, page * RECENT_PAGE + i + 1, true), ''))
  if (pages > 1) lines.push(`Pagina ${page + 1}/${pages}`)

  const keyboard = entryButtons(entries, page * RECENT_PAGE + 1)
  const nav = []
  if (page > 0) nav.push(btn('⬅️ Mai noi', `s:r:${page - 1}`))
  if (page < pages - 1) nav.push(btn('Mai vechi ➡️', `s:r:${page + 1}`))
  if (nav.length) keyboard.push(nav)
  keyboard.push([btn('🏠 Meniu', 's:menu')])
  return { text: lines.join('\n'), keyboard }
}

async function monthOverview(key) {
  const month = parseMonthKey(key) || currentMonth()
  const [entries, balances] = await Promise.all([
    prisma.salaryEntry.findMany({
      where: { deleted: false, date: monthRange(month) },
      select: { teacherId: true, teacherName: true, kind: true, amount: true },
    }),
    teacherIdsWithBalance(),
  ])

  const byTeacher = new Map()
  for (const e of entries) {
    if (!byTeacher.has(e.teacherId)) byTeacher.set(e.teacherId, { name: e.teacherName, rows: [] })
    byTeacher.get(e.teacherId).rows.push(e)
  }

  const lines = [`📅 <b>${monthLabel(month)} — pe profesori</b>`, '']
  const total = summarize(entries)
  const rows = [...byTeacher.entries()]
    .map(([id, t]) => ({ id, name: t.name || '—', ...summarize(t.rows) }))
    .sort((a, b) => b.earned - a.earned)

  if (!rows.length) lines.push('<i>Nicio sumă în luna aceasta.</i>')
  for (const r of rows) {
    lines.push(
      `👨‍🏫 <b>${escapeHtml(r.name)}</b>`,
      `     Câștigat <b>${fmtLei(r.earned)}</b> (${r.lessons} lecții) · Achitat ${fmtLei(r.paid)} · Sold acum ${fmtBalance(balances.get(r.id) || 0)}`,
    )
  }
  lines.push('', `<b>Total:</b> câștigat ${fmtLei(total.earned)} · achitat ${fmtLei(total.paid)}`)

  const prev = shiftMonth(month, -1)
  const next = shiftMonth(month, 1)
  const nav = [btn(`◀️ ${monthLabel(prev)}`, `s:mo:${monthKey(prev)}`)]
  if (monthKey(next) <= monthKey(currentMonth())) nav.push(btn(`${monthLabel(next)} ▶️`, `s:mo:${monthKey(next)}`))

  return { text: lines.join('\n'), keyboard: [nav, [btn('🏠 Meniu', 's:menu')]] }
}

async function entryCard(entryId) {
  const entry = await prisma.salaryEntry.findUnique({ where: { id: entryId } })
  if (!entry) return { text: '❌ Rândul nu există.', keyboard: [[btn('🏠 Meniu', 's:menu')]] }

  // Înapoi în luna rândului, nu în luna curentă
  const [year, month] = utcToZonedParts(new Date(entry.date).toISOString()).date.split('-').map(Number)
  const back = btn('⬅️ Înapoi', `s:h:${entry.teacherId}:${monthKey({ year, month })}:0`)

  const lines = [`👨‍🏫 ${escapeHtml(entry.teacherName || '—')}`, '', entryText(entry)]
  if (entry.kind === 'LESSON' || entry.kind === 'MAKEUP') {
    lines.push('', entry.manual
      ? '<i>Suma a fost pusă de mână — nu se mai recalculează la corectarea prezenței.</i>'
      : '<i>Adăugată automat la salvarea lecției.</i>')
  }
  lines.push(`🕐 Înregistrat: ${fmtShort(entry.createdAt)}`)

  if (entry.deleted) {
    lines.push('', `🗑 <b>Anulat</b>${entry.deletedByName ? ` de ${escapeHtml(entry.deletedByName)}` : ''}${entry.deletedAt ? `, ${fmtShort(entry.deletedAt)}` : ''}`)
    return { text: lines.join('\n'), keyboard: [[back]] }
  }

  return {
    text: lines.join('\n'),
    keyboard: [
      [btn('✏️ Editează suma / motivul', `s:ee:${entry.id}`)],
      [btn('🗑 Anulează', `s:ed:${entry.id}`)],
      [back],
    ],
  }
}

// ============================================
// AȘTEPTAREA UNUI MESAJ (sumă + motiv)
// ============================================

async function setState(chatId, data) {
  const expiresAt = new Date(Date.now() + STATE_TTL_MIN * 60 * 1000)
  const fields = { action: data.action, teacherId: data.teacherId || null, entryId: data.entryId || null, expiresAt }
  await prisma.salaryBotState.upsert({
    where: { chatId: String(chatId) },
    update: fields,
    create: { chatId: String(chatId), ...fields },
  })
}

async function clearState(chatId) {
  await prisma.salaryBotState.deleteMany({ where: { chatId: String(chatId) } })
}

/** Ia starea și o consumă, ca un mesaj trimis de două ori să nu salveze de două ori. */
async function takeState(chatId) {
  const state = await prisma.salaryBotState.findUnique({ where: { chatId: String(chatId) } })
  if (!state) return null
  const { count } = await prisma.salaryBotState.deleteMany({ where: { id: state.id } })
  if (!count || state.expiresAt < new Date()) return null
  return state
}

/** „200 Lecție cu grupa X" → { amount: 200, reason: 'Lecție cu grupa X' } */
function parseAmountAndReason(text) {
  const m = String(text || '')
    .trim()
    // Suma e urmată de spațiu, „lei" sau nimic — „1.400" sau „200 5 elevi" nu trec drept altă sumă
    .match(/^([+\-−]?)\s*(\d+(?:[.,]\d{1,2})?)(?=\s|lei|$)\s*(?:lei\b)?\s*[-—:,.]?\s*([\s\S]*)$/i)
  if (!m) return null
  const amount = parseFloat(m[2].replace(',', '.'))
  if (!Number.isFinite(amount)) return null
  return {
    amount: m[1] === '-' || m[1] === '−' ? -amount : amount,
    explicitSign: !!m[1],
    reason: m[3].trim().slice(0, 300),
  }
}

const cancelRow = [btn('✖️ Renunță', 's:x')]

async function promptView(action, { teacherId, entryId }) {
  if (action === 'edit') {
    const entry = await prisma.salaryEntry.findUnique({ where: { id: entryId } })
    if (!entry || entry.deleted) return null
    return {
      text: [
        '✏️ <b>Editează</b>',
        '',
        entryText(entry),
        '',
        'Scrie noua sumă și, dacă vrei, un motiv nou. De exemplu:',
        `<code>${Math.abs(entry.amount)}</code> — păstrează motivul`,
        `<code>${Math.abs(entry.amount)} ${escapeHtml(entry.reason)}</code>`,
        entry.kind === 'PAYOUT' ? '\n<i>Scrie suma fără minus — se scade oricum din salariu.</i>' : '',
      ].join('\n'),
      keyboard: [cancelRow],
    }
  }

  const teacher = await prisma.user.findUnique({ where: { id: teacherId }, select: { name: true, email: true } })
  if (!teacher) return null
  const name = escapeHtml(displayName(teacher))

  if (action === 'bonus') {
    return {
      text: [
        `🎁 <b>Bonus pentru ${name}</b>`,
        '',
        'Scrie suma și motivul într-un singur mesaj. De exemplu:',
        '<code>200 Lecție cu grupa Kids din 03.10, nepusă în sistem</code>',
      ].join('\n'),
      keyboard: [cancelRow],
    }
  }

  if (action === 'adjust') {
    return {
      text: [
        `✏️ <b>Corectare pentru ${name}</b>`,
        '',
        'Scrie suma cu semn și motivul. De exemplu:',
        '<code>-100 Avans dat în numerar</code>',
        '<code>+50 Diferență lecție individuală</code>',
      ].join('\n'),
      keyboard: [cancelRow],
    }
  }

  if (action === 'payout') {
    const balance = await getBalance(teacherId)
    const month = currentMonth()
    const keyboard = []
    if (balance > 0) {
      keyboard.push([btn(`✅ Tot soldul: ${fmtLei(balance)} — „Salariu”`, `s:pa:${teacherId}:${Math.round(balance * 100)}`)])
    }
    keyboard.push(cancelRow)
    return {
      text: [
        `💸 <b>Scoate salariul — ${name}</b>`,
        '',
        `Sold de primit: <b>${fmtBalance(balance)}</b>`,
        '',
        'Apasă butonul pentru tot soldul, sau scrie suma și mesajul. De exemplu:',
        `<code>${balance > 0 ? Math.round(balance * 100) / 100 : 1000} Salariu ${monthLabel(month).toLowerCase()}</code>`,
      ].join('\n'),
      keyboard,
    }
  }
  return null
}

async function savedView(entry, header) {
  const [balance, teacher] = await Promise.all([
    getBalance(entry.teacherId),
    prisma.user.findUnique({ where: { id: entry.teacherId }, select: { telegramChatId: true } }),
  ])
  return {
    text: [
      header,
      '',
      entryText(entry),
      '',
      `💼 Sold nou: <b>${fmtBalance(balance)}</b>`,
      teacher?.telegramChatId
        ? '<i>Profesorul a primit mesaj.</i>'
        : '⚠️ <i>Profesorul nu are Telegram conectat — nu a primit mesaj.</i>',
    ].join('\n'),
    keyboard: [[btn('👨‍🏫 Înapoi la profesor', `s:t:${entry.teacherId}`)], [btn('🏠 Meniu', 's:menu')]],
  }
}

async function handleInput(chatId, user, text) {
  const state = await takeState(chatId)
  if (!state) return false

  const parsed = parseAmountAndReason(text)
  const retry = async (msg) => {
    await setState(chatId, state)
    await send(chatId, { text: `⚠️ ${msg}\n\nMai încearcă, sau apasă Renunță.`, keyboard: [cancelRow] })
  }
  if (!parsed) {
    await retry('Mesajul trebuie să înceapă cu suma, de ex. <code>200 Lecție cu grupa X</code>.')
    return true
  }
  if (Math.abs(parsed.amount) > MAX_AMOUNT) {
    await retry('Suma e prea mare.')
    return true
  }

  const actor = { id: user.id, name: displayName(user) }

  try {
    if (state.action === 'bonus') {
      if (!(parsed.amount > 0)) { await retry('Bonusul trebuie să fie mai mare ca 0.'); return true }
      const entry = await addManualEntry({
        teacherId: state.teacherId, kind: 'BONUS', amount: parsed.amount, reason: parsed.reason || 'Bonus', actor,
      })
      await send(chatId, await savedView(entry, '✅ <b>Bonus adăugat</b>'))
      return true
    }

    if (state.action === 'payout') {
      const amount = Math.abs(parsed.amount)
      if (!(amount > 0)) { await retry('Suma trebuie să fie mai mare ca 0.'); return true }
      const entry = await addManualEntry({
        teacherId: state.teacherId, kind: 'PAYOUT', amount: -amount, reason: parsed.reason || 'Salariu', actor,
      })
      await send(chatId, await savedView(entry, '✅ <b>Salariu scos</b>'))
      return true
    }

    if (state.action === 'adjust') {
      if (!parsed.amount) { await retry('Suma nu poate fi 0.'); return true }
      if (!parsed.reason) { await retry('Scrie și motivul corectării, după sumă.'); return true }
      const entry = await addManualEntry({
        teacherId: state.teacherId, kind: 'ADJUSTMENT', amount: parsed.amount, reason: parsed.reason, actor,
      })
      await send(chatId, await savedView(entry, '✅ <b>Corectare salvată</b>'))
      return true
    }

    if (state.action === 'edit') {
      const current = await prisma.salaryEntry.findUnique({ where: { id: state.entryId } })
      if (!current || current.deleted) {
        await send(chatId, { text: '❌ Rândul nu mai există.', keyboard: [[btn('🏠 Meniu', 's:menu')]] })
        return true
      }
      let amount = parsed.amount
      if (current.kind === 'PAYOUT') amount = -Math.abs(amount)
      else if (current.kind !== 'ADJUSTMENT' && amount < 0) { await retry('Suma nu poate fi negativă aici.'); return true }
      const { entry } = await editEntry(current.id, { amount, reason: parsed.reason || null }, actor)
      await send(chatId, await savedView(entry, '✅ <b>Modificare salvată</b>'))
      return true
    }
  } catch (err) {
    console.error('[salary-bot] input:', err)
    await send(chatId, { text: `❌ Nu s-a putut salva: ${escapeHtml(err.message)}`, keyboard: [[btn('🏠 Meniu', 's:menu')]] })
    return true
  }
  return false
}

// ============================================
// WEBHOOK
// ============================================

const NOT_LINKED_TEXT =
  'Nu te recunosc încă. Conectează-ți contul de Telegram din CRM → Securitate → Telegram, apoi scrie /start aici.'

async function homeFor(user) {
  return isSalaryAdmin(user) ? adminHome() : teacherCard(user.id, false)
}

async function handleStart(message) {
  const chatId = message.chat.id
  const token = message.text.trim().split(/\s+/)[1]

  // Linkul de conectare din CRM funcționează și aici
  if (token) {
    const linked = await prisma.user.findFirst({
      where: { telegramLinkToken: token, telegramLinkExpires: { gt: new Date() } },
      select: { id: true },
    })
    if (linked) {
      await prisma.user.update({
        where: { id: linked.id },
        data: {
          telegramChatId: String(chatId),
          telegramUsername: message.from?.username || null,
          telegramLinkToken: null,
          telegramLinkExpires: null,
        },
      })
    }
  }

  const user = await findUser(message.from.id)
  if (!user) {
    await send(chatId, { text: NOT_LINKED_TEXT })
    return
  }
  await clearState(chatId)
  await send(chatId, await homeFor(user))
}

async function handleCallback(cq) {
  const chatId = cq.message?.chat?.id
  const messageId = cq.message?.message_id
  const data = cq.data || ''
  const ack = (text) => tg('answerCallbackQuery', { callback_query_id: cq.id, ...(text ? { text } : {}) })

  if (!chatId || cq.message.chat.type !== 'private' || !data.startsWith('s:')) {
    await ack()
    return
  }

  const user = await findUser(cq.from.id)
  if (!user) {
    await ack('Cont neconectat')
    await send(chatId, { text: NOT_LINKED_TEXT })
    return
  }
  const admin = isSalaryAdmin(user)
  const [, action, a1, a2, a3] = data.split(':')

  // Id-urile din butoane trebuie să arate ca id-uri — altfel nu le dăm la bază
  const badId = (id) => !OBJECT_ID.test(id || '')
  const denied = async () => ack('Nu ai acces la asta')

  switch (action) {
    case 'menu':
    case 'x': {
      if (action === 'x') await clearState(chatId)
      await ack(action === 'x' ? 'Anulat' : null)
      await edit(chatId, messageId, await homeFor(user))
      return
    }

    case 't': {
      if (badId(a1)) return ack()
      if (!admin && a1 !== user.id) return denied()
      await ack()
      await edit(chatId, messageId, await teacherCard(a1, admin))
      return
    }

    case 'h': {
      if (badId(a1)) return ack()
      if (!admin && a1 !== user.id) return denied()
      const key = a2 === 'all' || parseMonthKey(a2) ? a2 : monthKey(currentMonth())
      await ack()
      await edit(chatId, messageId, await history(a1, key, Math.max(0, parseInt(a3, 10) || 0), admin))
      return
    }
  }

  // De aici în jos doar adminii de salarii
  if (!admin) return denied()

  switch (action) {
    case 'tl':
      await ack()
      await edit(chatId, messageId, await teacherList(parseInt(a1, 10) || 0))
      return

    case 'r':
      await ack()
      await edit(chatId, messageId, await recent(Math.max(0, parseInt(a1, 10) || 0)))
      return

    case 'mo':
      await ack()
      await edit(chatId, messageId, await monthOverview(a1))
      return

    case 'e':
      if (badId(a1)) return ack()
      await ack()
      await edit(chatId, messageId, await entryCard(a1))
      return

    case 'b':
    case 'a':
    case 'p':
    case 'ee': {
      if (badId(a1)) return ack()
      const stateAction = { b: 'bonus', a: 'adjust', p: 'payout', ee: 'edit' }[action]
      const ids = action === 'ee' ? { entryId: a1 } : { teacherId: a1 }
      const view = await promptView(stateAction, ids)
      if (!view) return ack('Nu mai există')
      await setState(chatId, { action: stateAction, ...ids })
      await ack()
      await edit(chatId, messageId, view)
      return
    }

    case 'pa': {
      // Tot soldul, cu suma arătată pe buton — ce a văzut adminul, aia se scoate
      if (badId(a1)) return ack()
      const amount = (parseInt(a2, 10) || 0) / 100
      if (!(amount > 0)) return ack('Sumă invalidă')

      // Două apăsări rapide nu scot salariul de două ori
      const duplicate = await prisma.salaryEntry.findFirst({
        where: {
          teacherId: a1, kind: 'PAYOUT', amount: -amount, deleted: false,
          createdAt: { gte: new Date(Date.now() - 60 * 1000) },
        },
      })
      if (duplicate) return ack('Deja înregistrat')

      await clearState(chatId)
      await ack('Salvat')
      const entry = await addManualEntry({
        teacherId: a1, kind: 'PAYOUT', amount: -amount, reason: 'Salariu',
        actor: { id: user.id, name: displayName(user) },
      })
      await edit(chatId, messageId, await savedView(entry, '✅ <b>Salariu scos</b>'))
      return
    }

    case 'ed': {
      if (badId(a1)) return ack()
      const entry = await prisma.salaryEntry.findUnique({ where: { id: a1 } })
      if (!entry || entry.deleted) return ack('Nu mai există')
      await ack()
      await edit(chatId, messageId, {
        text: [
          '🗑 <b>Anulezi suma aceasta?</b>',
          '',
          `👨‍🏫 ${escapeHtml(entry.teacherName || '—')}`,
          entryText(entry),
          '',
          '<i>Rămâne în istoric ca anulată, dar nu mai contează în sold. Profesorul primește mesaj.</i>',
        ].join('\n'),
        keyboard: [[btn('🗑 Da, anulează', `s:edy:${entry.id}`), btn('✖️ Nu', `s:e:${entry.id}`)]],
      })
      return
    }

    case 'edy': {
      if (badId(a1)) return ack()
      try {
        const entry = await deleteEntry(a1, { id: user.id, name: displayName(user) })
        await ack('Anulat')
        const balance = await getBalance(entry.teacherId)
        await edit(chatId, messageId, {
          text: [
            '🗑 <b>Anulat</b>',
            '',
            entryText(entry),
            '',
            `💼 Sold nou: <b>${fmtBalance(balance)}</b>`,
          ].join('\n'),
          keyboard: [[btn('👨‍🏫 Înapoi la profesor', `s:t:${entry.teacherId}`)], [btn('🏠 Meniu', 's:menu')]],
        })
      } catch (err) {
        await ack(err.message)
      }
      return
    }
  }

  await ack('Acțiune necunoscută')
}

export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url)
    if (WEBHOOK_SECRET && searchParams.get('secret') !== WEBHOOK_SECRET) {
      console.error('[salary-bot] Secret invalid sau lipsă în URL-ul webhook-ului')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!BOT_TOKEN) {
      console.error('[salary-bot] TELEGRAM_SALARY_BOT_TOKEN lipsește')
      return NextResponse.json({ ok: true })
    }

    const body = await request.json()

    if (body.callback_query) {
      await handleCallback(body.callback_query)
      return NextResponse.json({ ok: true })
    }

    const message = body.message
    // Salariile se discută doar în privat, nu în grupuri
    if (!message?.text || message.chat?.type !== 'private') {
      return NextResponse.json({ ok: true })
    }

    const text = message.text.trim()
    if (text.startsWith('/start') || text === '/meniu' || text === '/menu') {
      await handleStart(message)
      return NextResponse.json({ ok: true })
    }

    const user = await findUser(message.from.id)
    if (!user) {
      await send(message.chat.id, { text: NOT_LINKED_TEXT })
      return NextResponse.json({ ok: true })
    }

    if (isSalaryAdmin(user) && !text.startsWith('/')) {
      const handled = await handleInput(message.chat.id, user, text)
      if (handled) return NextResponse.json({ ok: true })
    }

    await send(message.chat.id, await homeFor(user))
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[salary-bot] webhook error:', error)
    // 200, ca Telegram să nu reia la nesfârșit același update stricat
    return NextResponse.json({ ok: true })
  }
}

/** Diagnostic: /api/telegram/salary?secret=... — cum vede Telegram webhook-ul. */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  if (!WEBHOOK_SECRET || searchParams.get('secret') !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: 'TELEGRAM_SALARY_BOT_TOKEN lipsește' }, { status: 500 })
  }
  const info = await tg('getWebhookInfo', {})
  if (!info?.ok) return NextResponse.json({ error: info?.description || 'Telegram indisponibil' }, { status: 502 })
  return NextResponse.json({
    registeredUrl: info.result.url || '',
    pendingUpdates: info.result.pending_update_count,
    lastErrorMessage: info.result.last_error_message || null,
  })
}
