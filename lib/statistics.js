import prisma from '@/lib/prisma'

/**
 * Statistica școlii — cifrele care chiar spun ceva despre cum merge treaba.
 *
 * Trei întrebări stau la baza tuturor secțiunilor:
 *   1. Câți oameni noi intră și câți dintre ei devin elevi? (lead-uri, conversie)
 *   2. Câți rămân? (plecări, absențe — semnele că cineva e pe cale să plece)
 *   3. Cine face treabă bună? (responsabilii de lead-uri, profesorii)
 *
 * Totul se compară cu perioada precedentă de aceeași lungime: o cifră singură
 * nu spune nimic, o cifră lângă cea de luna trecută spune tot.
 */

// ── Etapele prin care trece un lead ─────────────────────────────────────
// Rangul spune cât de departe a ajuns. Un lead care studiază a trecut prin
// toate etapele dinainte, așa că pâlnia se poate reconstrui din statusul de
// acum — singurul pe care îl ținem.
const STAGE_RANK = {
  LEAD: 0,
  TEST: 0,
  FARA_RASPUNS: 1,
  CONTACTAT: 1,
  FOLLOW_UP_1: 1,
  FOLLOW_UP_2: 1,
  FOLLOW_UP_2_PLUS: 1,
  SE_GANDESTE: 1,
  OLD_STUDENT: 1,
  PROGRAMAT_TESTARE: 2,
  PROGRAMAT: 2,
  PRIMA_LECTIE: 3,
  FINALIZAT_LECTIA: 3,
  ASTEPTAM_PLATA: 3,
  PLECAT: 3,    // a studiat și a plecat: a trecut sigur pe la lecții
  WAITLIST: 4,  // a spus da, așteaptă doar loc în grupă
  PLATIT: 4,
  STUDIAZA: 4,
  LOST_LEAD: 0, // nu mai știm unde s-a oprit; îl numărăm doar la intrare
}

export const FUNNEL_STEPS = [
  { key: 'total', rank: 0, label: 'Lead-uri intrate' },
  { key: 'contactat', rank: 1, label: 'Contactate' },
  { key: 'programat', rank: 2, label: 'Programate la testare' },
  { key: 'lectie', rank: 3, label: 'Au venit la lecție' },
  { key: 'castigat', won: true, label: 'Câștigate' },
]

// Un lead e câștigat când a spus da: stă pe listă așteptând loc, a plătit,
// sau învață deja. Contează și cel cu elev creat din el.
const isConverted = (lead) =>
  lead.status === 'WAITLIST' ||
  lead.status === 'PLATIT' ||
  lead.status === 'STUDIAZA' ||
  !!lead.convertedStudentId

const isLost = (lead) => lead.status === 'LOST_LEAD'

// Lead-urile generate automat din pagina Elevi n-au fost muncite de nimeni —
// ar face conversia să pară perfectă. Le ținem deoparte peste tot.
const isRealLead = (lead) => lead.source !== 'ELEV'

// ── Perioade ────────────────────────────────────────────────────────────

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

export function resolveRange(period, fromStr, toStr) {
  const now = new Date()
  const today = startOfDay(now)
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  if (period === 'custom' && (fromStr || toStr)) {
    const start = fromStr ? startOfDay(new Date(fromStr)) : new Date(2000, 0, 1)
    const end = toStr ? new Date(new Date(toStr).setHours(23, 59, 59, 999)) : now
    return { start, end, label: 'interval ales' }
  }

  if (period === 'prev-month') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const end = new Date(firstOfMonth.getTime() - 1)
    return { start, end, label: 'luna trecută' }
  }
  if (period === 'quarter') {
    return { start: new Date(today.getFullYear(), today.getMonth() - 2, 1), end: now, label: 'ultimele 3 luni' }
  }
  if (period === 'year') {
    return { start: new Date(today.getFullYear(), 0, 1), end: now, label: 'anul acesta' }
  }
  if (period === 'all') {
    return { start: new Date(2000, 0, 1), end: now, label: 'de la început' }
  }
  return { start: firstOfMonth, end: now, label: 'luna aceasta' }
}

/** Perioada dinaintea celei alese, de aceeași lungime — pentru comparație. */
function previousRange({ start, end }) {
  const length = end.getTime() - start.getTime()
  return { start: new Date(start.getTime() - length), end: new Date(start.getTime() - 1) }
}

const inRange = (date, { start, end }) => {
  if (!date) return false
  const t = new Date(date).getTime()
  return t >= start.getTime() && t <= end.getTime()
}

const monthKey = (date) => {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)

/** Creșterea față de perioada precedentă, în procente. */
const delta = (now, before) => {
  if (before === 0) return now > 0 ? null : 0   // din nimic nu se calculează creștere
  return Math.round(((now - before) / before) * 1000) / 10
}

// ── Citirea datelor ─────────────────────────────────────────────────────

const EVOLUTION_MONTHS = 12

async function loadRaw(range) {
  const evolutionStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth() - (EVOLUTION_MONTHS - 1),
    1
  )
  // Fereastra de citire acoperă și perioada aleasă, și cea precedentă, și
  // graficul de evoluție — ce e mai devreme dintre ele.
  const prev = previousRange(range)
  const windowStart = new Date(Math.min(evolutionStart.getTime(), prev.start.getTime()))

  const [users, leads, students, groups, groupStudents, sessions, payments] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ['SUPERADMIN', 'ADMIN', 'TEACHER'] } },
      select: { id: true, name: true, email: true, role: true, active: true },
    }),
    prisma.lead.findMany({
      select: {
        id: true, status: true, source: true, assignedToId: true, createdAt: true,
        convertedStudentId: true, nextFollowUpAt: true,
      },
    }),
    prisma.student.findMany({
      select: { id: true, fullName: true, createdAt: true, active: true },
    }),
    prisma.group.findMany({
      select: { id: true, name: true, level: true, teacherId: true, active: true, billingType: true, completedAt: true },
    }),
    prisma.groupStudent.findMany({
      select: {
        id: true, groupId: true, studentId: true, status: true,
        statusChangedAt: true, enrolledAt: true, lessonsRemaining: true,
      },
    }),
    prisma.lessonSession.findMany({
      where: { date: { gte: windowStart } },
      select: { id: true, groupId: true, date: true, lessonsDeducted: true },
    }),
    prisma.payment.findMany({
      where: { paymentDate: { gte: windowStart } },
      select: { id: true, amount: true, debt: true, paymentDate: true, groupStudentId: true },
    }),
  ])

  const attendances = sessions.length
    ? await prisma.attendance.findMany({
        where: { sessionId: { in: sessions.map((s) => s.id) } },
        select: { sessionId: true, studentId: true, status: true },
      })
    : []

  return { users, leads, students, groups, groupStudents, sessions, payments, attendances }
}

// ── Secțiunile ──────────────────────────────────────────────────────────

/** Ce s-a întâmplat cu lead-urile intrate în perioadă. */
function leadSection(leads, students, range, prev) {
  const real = leads.filter(isRealLead)
  const cohort = real.filter((l) => inRange(l.createdAt, range))
  const prevCohort = real.filter((l) => inRange(l.createdAt, prev))

  const converted = cohort.filter(isConverted)
  const prevConverted = prevCohort.filter(isConverted)

  // Pâlnia: câți au ajuns cel puțin până la fiecare etapă. Ultima treaptă se
  // numără după aceeași regulă ca rata de conversie de sus, ca cele două cifre
  // să nu se contrazică.
  const funnel = FUNNEL_STEPS.map((step) => {
    const count = step.won
      ? converted.length
      : cohort.filter((l) => (STAGE_RANK[l.status] ?? 0) >= step.rank).length
    return { ...step, value: count, ofTotal: pct(count, cohort.length) }
  })

  // Cât durează, în medie, de la primul mesaj până la elev
  const studentById = new Map(students.map((s) => [s.id, s]))
  const days = converted
    .map((l) => {
      const student = l.convertedStudentId ? studentById.get(l.convertedStudentId) : null
      if (!student) return null
      const d = (new Date(student.createdAt) - new Date(l.createdAt)) / 86400000
      return d >= 0 ? d : null
    })
    .filter((d) => d != null)
  const avgDays = days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null

  // Pe surse: nu volumul contează, ci câți dintre ei devin elevi
  const bySourceMap = new Map()
  for (const lead of cohort) {
    const key = lead.source || 'ALTA'
    if (!bySourceMap.has(key)) bySourceMap.set(key, { source: key, total: 0, converted: 0, lost: 0 })
    const row = bySourceMap.get(key)
    row.total++
    if (isConverted(lead)) row.converted++
    if (isLost(lead)) row.lost++
  }
  const bySource = [...bySourceMap.values()]
    .map((r) => ({ ...r, rate: pct(r.converted, r.total) }))
    .sort((a, b) => b.total - a.total)

  // Statusurile de acum, pentru toate lead-urile reale (nu doar cohorta)
  const byStatus = {}
  for (const lead of real) byStatus[lead.status] = (byStatus[lead.status] || 0) + 1

  const now = Date.now()
  const overdue = real.filter(
    (l) => l.nextFollowUpAt && new Date(l.nextFollowUpAt).getTime() < now && !isConverted(l) && !isLost(l)
  ).length

  return {
    total: cohort.length,
    totalDelta: delta(cohort.length, prevCohort.length),
    converted: converted.length,
    convertedDelta: delta(converted.length, prevConverted.length),
    conversionRate: pct(converted.length, cohort.length),
    prevConversionRate: pct(prevConverted.length, prevCohort.length),
    lost: cohort.filter(isLost).length,
    inProgress: cohort.filter((l) => !isConverted(l) && !isLost(l)).length,
    avgDaysToClient: avgDays,
    overdueFollowUps: overdue,
    funnel,
    bySource,
    byStatus,
  }
}

/** Clasamentul oamenilor care se ocupă de lead-uri. */
function ownerSection(leads, students, users, range) {
  const MIN_LEADS = 5   // sub atât, un procent e doar noroc
  const userById = new Map(users.map((u) => [u.id, u]))
  const studentById = new Map(students.map((s) => [s.id, s]))

  const rows = new Map()
  const now = Date.now()

  for (const lead of leads) {
    if (!isRealLead(lead)) continue
    if (!inRange(lead.createdAt, range)) continue
    if (!lead.assignedToId) continue

    const id = lead.assignedToId
    if (!rows.has(id)) {
      const user = userById.get(id)
      rows.set(id, {
        id,
        name: user?.name || user?.email || 'Șters',
        role: user?.role || null,
        total: 0, converted: 0, lost: 0, inProgress: 0, overdue: 0, days: [],
      })
    }
    const row = rows.get(id)
    row.total++

    if (isConverted(lead)) {
      row.converted++
      const student = lead.convertedStudentId ? studentById.get(lead.convertedStudentId) : null
      if (student) {
        const d = (new Date(student.createdAt) - new Date(lead.createdAt)) / 86400000
        if (d >= 0) row.days.push(d)
      }
    } else if (isLost(lead)) {
      row.lost++
    } else {
      row.inProgress++
      if (lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < now) row.overdue++
    }
  }

  const ranked = [...rows.values()].map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    total: r.total,
    converted: r.converted,
    lost: r.lost,
    inProgress: r.inProgress,
    overdue: r.overdue,
    conversionRate: pct(r.converted, r.total),
    lostRate: pct(r.lost, r.total),
    avgDaysToClient: r.days.length
      ? Math.round((r.days.reduce((a, b) => a + b, 0) / r.days.length) * 10) / 10
      : null,
    enoughData: r.total >= MIN_LEADS,
  }))

  const scored = ranked.filter((r) => r.enoughData).sort((a, b) => b.conversionRate - a.conversionRate)
  const tooFew = ranked.filter((r) => !r.enoughData).sort((a, b) => b.total - a.total)

  const unassigned = leads.filter(
    (l) => isRealLead(l) && inRange(l.createdAt, range) && !l.assignedToId
  ).length

  return { minLeads: MIN_LEADS, ranked: scored, tooFew, unassigned }
}

/** Cum stă fiecare profesor: elevi, plecări, lecții, prezență, încasări. */
function teacherSection(data, range, prev) {
  const { users, groups, groupStudents, sessions, payments, attendances } = data

  const teachers = users.filter((u) => u.role === 'TEACHER')
  const groupById = new Map(groups.map((g) => [g.id, g]))
  const gsById = new Map(groupStudents.map((gs) => [gs.id, gs]))

  const sessionById = new Map(sessions.map((s) => [s.id, s]))
  const sessionsInRange = sessions.filter((s) => inRange(s.date, range))
  const sessionIdsInRange = new Set(sessionsInRange.map((s) => s.id))
  const prevSessionIds = new Set(sessions.filter((s) => inRange(s.date, prev)).map((s) => s.id))

  // Elevii se țin ca mulțimi: cine învață în două grupe ale aceluiași
  // profesor rămâne un singur elev, nu doi.
  const base = () => ({
    groupsActive: 0, left: 0,
    lessons: 0, prevLessons: 0, lessonsClosed: 0,
    present: 0, absent: 0, revenue: 0, debt: 0,
    activeIds: new Set(),    // învață acum la el
    joinedIds: new Set(),    // au intrat într-o grupă de-a lui în perioadă
    earlierIds: new Set(),   // erau la el și înainte de perioadă
    leftIds: new Set(),
  })

  const rows = new Map(teachers.map((t) => [t.id, {
    id: t.id, name: t.name || t.email, active: t.active, ...base(),
  }]))
  const ensure = (teacherId) => {
    if (!teacherId) return null
    if (!rows.has(teacherId)) rows.set(teacherId, { id: teacherId, name: 'Profesor șters', active: false, ...base() })
    return rows.get(teacherId)
  }

  for (const group of groups) {
    const row = ensure(group.teacherId)
    if (row && group.active && !group.completedAt) row.groupsActive++
  }

  for (const gs of groupStudents) {
    const group = groupById.get(gs.groupId)
    const row = ensure(group?.teacherId)
    if (!row) continue

    if (gs.status === 'ACTIVE') row.activeIds.add(gs.studentId)

    if (inRange(gs.enrolledAt, range)) row.joinedIds.add(gs.studentId)
    else if (gs.enrolledAt && new Date(gs.enrolledAt) < range.start) row.earlierIds.add(gs.studentId)

    // Plecările se datează după statusChangedAt; cele vechi, fără dată, nu
    // se pot pune pe seama unei perioade anume.
    if (gs.status === 'LEFT' && inRange(gs.statusChangedAt, range)) row.leftIds.add(gs.studentId)
  }

  for (const session of sessionsInRange) {
    const row = ensure(groupById.get(session.groupId)?.teacherId)
    if (!row) continue
    row.lessons++
    if (session.lessonsDeducted) row.lessonsClosed++
  }
  for (const id of prevSessionIds) {
    const row = ensure(groupById.get(sessionById.get(id)?.groupId)?.teacherId)
    if (row) row.prevLessons++
  }

  for (const att of attendances) {
    if (!sessionIdsInRange.has(att.sessionId)) continue
    const row = ensure(groupById.get(sessionById.get(att.sessionId)?.groupId)?.teacherId)
    if (!row) continue
    if (att.status === 'PRESENT') row.present++
    else row.absent++
  }

  for (const payment of payments) {
    if (!inRange(payment.paymentDate, range)) continue
    const gs = payment.groupStudentId ? gsById.get(payment.groupStudentId) : null
    const row = ensure(groupById.get(gs?.groupId)?.teacherId)
    if (!row) continue
    row.revenue += payment.amount || 0
    row.debt += payment.debt || 0
  }

  // Scorul: prezența cântărește cel mai mult (ea arată dacă elevii vin),
  // apoi retenția, apoi disciplina de a închide lecțiile la timp.
  const WEIGHTS = { attendance: 0.45, retention: 0.35, closing: 0.20 }

  const list = [...rows.values()].map((r) => {
    const studentsActive = r.activeIds.size
    const left = r.leftIds.size

    // „Nou" înseamnă elev care n-a mai fost la profesorul ăsta înainte și care
    // învață la el și acum. Mutarea dintr-o grupă în alta a aceluiași profesor
    // deschide o înscriere nouă, dar nu aduce un elev nou; iar cine a intrat și
    // a ieșit între timp se numără la plecări, nu aici. Așa „noi" rămâne mereu
    // o parte din „elevi", cum se și citește.
    const studentsNew = [...r.joinedIds]
      .filter((id) => !r.earlierIds.has(id) && r.activeIds.has(id)).length

    const marked = r.present + r.absent
    const attendanceRate = pct(r.present, marked)
    const retentionBase = studentsActive + left
    const retentionRate = pct(studentsActive, retentionBase)
    const closingRate = pct(r.lessonsClosed, r.lessons)

    const enoughData = r.lessons > 0 && marked > 0
    const score = enoughData
      ? Math.round(
          WEIGHTS.attendance * (attendanceRate ?? 0) +
          WEIGHTS.retention * (retentionRate ?? 100) +
          WEIGHTS.closing * (closingRate ?? 0)
        )
      : null

    const { activeIds, joinedIds, earlierIds, leftIds, ...rest } = r
    return {
      ...rest,
      studentsActive,
      studentsNew,
      left,
      revenue: Math.round(r.revenue),
      debt: Math.round(r.debt),
      attendanceRate,
      retentionRate,
      closingRate,
      churnRate: pct(left, retentionBase),
      lessonsDelta: delta(r.lessons, r.prevLessons),
      enoughData,
      score,
    }
  })

  const ranked = list.filter((t) => t.enoughData).sort((a, b) => b.score - a.score)
  const idle = list.filter((t) => !t.enoughData && (t.active || t.studentsActive > 0))
    .sort((a, b) => b.studentsActive - a.studentsActive)

  return { weights: WEIGHTS, ranked, idle }
}

/** Absențele: rata generală, elevii cu risc, grupele problemă. */
function absenceSection(data, range, prev) {
  const { groups, groupStudents, students, sessions, attendances } = data

  const groupById = new Map(groups.map((g) => [g.id, g]))
  const studentById = new Map(students.map((s) => [s.id, s]))
  const sessionById = new Map(sessions.map((s) => [s.id, s]))
  const userNameByTeacher = new Map(groups.map((g) => [g.teacherId, g.teacherId]))

  const idsInRange = new Set(sessions.filter((s) => inRange(s.date, range)).map((s) => s.id))
  const idsInPrev = new Set(sessions.filter((s) => inRange(s.date, prev)).map((s) => s.id))

  let present = 0, absent = 0, prevPresent = 0, prevAbsent = 0
  const byStudent = new Map()
  const byGroup = new Map()

  for (const att of attendances) {
    const inNow = idsInRange.has(att.sessionId)
    const inPrev = idsInPrev.has(att.sessionId)
    if (!inNow && !inPrev) continue

    if (inPrev) {
      if (att.status === 'PRESENT') prevPresent++
      else prevAbsent++
      continue
    }

    if (att.status === 'PRESENT') present++
    else absent++

    const groupId = sessionById.get(att.sessionId)?.groupId
    if (!byGroup.has(groupId)) byGroup.set(groupId, { groupId, present: 0, absent: 0 })
    const g = byGroup.get(groupId)
    att.status === 'PRESENT' ? g.present++ : g.absent++

    if (!byStudent.has(att.studentId)) {
      byStudent.set(att.studentId, { studentId: att.studentId, present: 0, absent: 0, groupIds: new Set() })
    }
    const s = byStudent.get(att.studentId)
    att.status === 'PRESENT' ? s.present++ : s.absent++
    if (groupId) s.groupIds.add(groupId)
  }

  const marked = present + absent

  // Elevii cu risc: nu cei cu multe absențe în cifre absolute, ci cei care
  // lipsesc des din ce li s-a programat — și au lipsit de cel puțin 2 ori.
  const atRisk = [...byStudent.values()]
    .map((s) => {
      const total = s.present + s.absent
      const groupsOf = [...s.groupIds].map((id) => groupById.get(id)).filter(Boolean)
      return {
        studentId: s.studentId,
        name: studentById.get(s.studentId)?.fullName || 'Elev șters',
        present: s.present,
        absent: s.absent,
        total,
        absenceRate: pct(s.absent, total),
        groups: groupsOf.map((g) => g.name),
        teacherIds: groupsOf.map((g) => g.teacherId),
      }
    })
    .filter((s) => s.absent >= 2)
    .sort((a, b) => b.absenceRate - a.absenceRate || b.absent - a.absent)

  const worstGroups = [...byGroup.values()]
    .map((g) => {
      const group = groupById.get(g.groupId)
      const total = g.present + g.absent
      return {
        groupId: g.groupId,
        name: group?.name || 'Grupă ștearsă',
        level: group?.level || null,
        teacherId: group?.teacherId || null,
        present: g.present,
        absent: g.absent,
        absenceRate: pct(g.absent, total),
      }
    })
    .filter((g) => g.present + g.absent >= 4)
    .sort((a, b) => b.absenceRate - a.absenceRate)

  // Elevii cu pachetul pe zero, la grupele care se plătesc pe lecții
  const outOfLessons = groupStudents
    .filter((gs) => gs.status === 'ACTIVE' && (gs.lessonsRemaining ?? 0) <= 0)
    .map((gs) => ({
      studentId: gs.studentId,
      name: studentById.get(gs.studentId)?.fullName || 'Elev șters',
      group: groupById.get(gs.groupId)?.name || '—',
      billingType: groupById.get(gs.groupId)?.billingType,
      lessonsRemaining: gs.lessonsRemaining ?? 0,
    }))
    .filter((s) => s.billingType === 'INDIVIDUAL')

  return {
    present,
    absent,
    marked,
    attendanceRate: pct(present, marked),
    prevAttendanceRate: pct(prevPresent, prevPresent + prevAbsent),
    absenceRate: pct(absent, marked),
    atRisk,
    worstGroups,
    outOfLessons,
  }
}

/** Elevi, plecări, bani — starea școlii acum și mișcarea din perioadă. */
function schoolSection(data, range, prev) {
  const { students, groups, groupStudents, sessions, payments } = data

  const activeGroupStudents = groupStudents.filter((gs) => gs.status === 'ACTIVE')
  const activeStudentIds = new Set(activeGroupStudents.map((gs) => gs.studentId))

  const newStudents = students.filter((s) => inRange(s.createdAt, range)).length
  const prevNewStudents = students.filter((s) => inRange(s.createdAt, prev)).length

  const left = groupStudents.filter((gs) => gs.status === 'LEFT' && inRange(gs.statusChangedAt, range)).length
  const prevLeft = groupStudents.filter((gs) => gs.status === 'LEFT' && inRange(gs.statusChangedAt, prev)).length

  const enrolled = groupStudents.filter((gs) => inRange(gs.enrolledAt, range)).length

  const lessons = sessions.filter((s) => inRange(s.date, range)).length
  const prevLessons = sessions.filter((s) => inRange(s.date, prev)).length

  const paid = payments.filter((p) => inRange(p.paymentDate, range))
  const prevPaid = payments.filter((p) => inRange(p.paymentDate, prev))
  const revenue = Math.round(paid.reduce((s, p) => s + (p.amount || 0), 0))
  const prevRevenue = Math.round(prevPaid.reduce((s, p) => s + (p.amount || 0), 0))
  const debt = Math.round(paid.reduce((s, p) => s + (p.debt || 0), 0))

  // Retenția se uită la baza de elevi de la care se pleacă
  const retentionBase = activeStudentIds.size + left

  return {
    studentsActive: activeStudentIds.size,
    studentsTotal: students.length,
    groupsActive: groups.filter((g) => g.active && !g.completedAt).length,
    newStudents,
    newStudentsDelta: delta(newStudents, prevNewStudents),
    enrolled,
    left,
    leftDelta: delta(left, prevLeft),
    churnRate: pct(left, retentionBase),
    retentionRate: pct(activeStudentIds.size, retentionBase),
    lessons,
    lessonsDelta: delta(lessons, prevLessons),
    revenue,
    revenueDelta: delta(revenue, prevRevenue),
    debt,
    revenuePerStudent: activeStudentIds.size > 0 ? Math.round(revenue / activeStudentIds.size) : null,
  }
}

/** Ultimele 12 luni, lună de lună — ca să se vadă trendul, nu doar poza de azi. */
function evolutionSection(data) {
  const { leads, students, sessions, payments, attendances, groupStudents } = data

  const now = new Date()
  const months = []
  for (let i = EVOLUTION_MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      key: monthKey(d),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      leads: 0, converted: 0, newStudents: 0, left: 0,
      lessons: 0, revenue: 0, present: 0, absent: 0,
    })
  }
  const byKey = new Map(months.map((m) => [m.key, m]))

  for (const lead of leads) {
    if (!isRealLead(lead)) continue
    const row = byKey.get(monthKey(lead.createdAt))
    if (!row) continue
    row.leads++
    if (isConverted(lead)) row.converted++
  }

  for (const s of students) {
    const row = byKey.get(monthKey(s.createdAt))
    if (row) row.newStudents++
  }

  for (const gs of groupStudents) {
    if (gs.status !== 'LEFT' || !gs.statusChangedAt) continue
    const row = byKey.get(monthKey(gs.statusChangedAt))
    if (row) row.left++
  }

  const sessionMonth = new Map()
  for (const session of sessions) {
    const key = monthKey(session.date)
    sessionMonth.set(session.id, key)
    const row = byKey.get(key)
    if (row) row.lessons++
  }

  for (const att of attendances) {
    const row = byKey.get(sessionMonth.get(att.sessionId))
    if (!row) continue
    att.status === 'PRESENT' ? row.present++ : row.absent++
  }

  for (const payment of payments) {
    const row = byKey.get(monthKey(payment.paymentDate))
    if (row) row.revenue += payment.amount || 0
  }

  return months.map((m) => ({
    ...m,
    revenue: Math.round(m.revenue),
    conversionRate: pct(m.converted, m.leads),
    attendanceRate: pct(m.present, m.present + m.absent),
    net: m.newStudents - m.left,
  }))
}

// ── Punctul de intrare ──────────────────────────────────────────────────

export async function buildStatistics({ period = 'month', from = null, to = null } = {}) {
  const range = resolveRange(period, from, to)
  const prev = previousRange(range)
  const data = await loadRaw(range)

  const teacherNames = new Map(
    data.users.filter((u) => u.role === 'TEACHER').map((u) => [u.id, u.name || u.email])
  )

  const absence = absenceSection(data, range, prev)
  // Numele profesorului, lipit acolo unde ajută la citit
  absence.worstGroups = absence.worstGroups.map((g) => ({
    ...g,
    teacher: g.teacherId ? teacherNames.get(g.teacherId) || null : null,
  }))
  absence.atRisk = absence.atRisk.map((s) => ({
    ...s,
    teachers: [...new Set(s.teacherIds.map((id) => teacherNames.get(id)).filter(Boolean))],
  }))

  return {
    period: { key: period, label: range.label, from: range.start.toISOString(), to: range.end.toISOString() },
    previous: { from: prev.start.toISOString(), to: prev.end.toISOString() },
    school: schoolSection(data, range, prev),
    leads: leadSection(data.leads, data.students, range, prev),
    owners: ownerSection(data.leads, data.students, data.users, range),
    teachers: teacherSection(data, range, prev),
    absence,
    evolution: evolutionSection(data),
    generatedAt: new Date().toISOString(),
  }
}
