// Verifica lib/statistics.js pe o fixtura cu cifre alese de noi, fara sa
// atinga baza reala: stim exact ce trebuie sa iasa din fiecare sectiune.
//
//   node scripts/test-statistics.mjs
import fs from 'fs'

// Statistica, cu un prisma fals în loc de bază: fixtura are cifre alese de
// noi, deci știm exact ce trebuie să iasă.
const FAKE_PRISMA = `
// ── fixtură ─────────────────────────────────────────────────────────────
const F = () => globalThis.__FIXTURE__

const matchDate = (row, field, where) => {
  if (!where?.[field]?.gte) return true
  return new Date(row[field]).getTime() >= new Date(where[field].gte).getTime()
}

const prisma = {
  user:          { findMany: async () => F().users },
  lead:          { findMany: async () => F().leads },
  student:       { findMany: async () => F().students },
  group:         { findMany: async () => F().groups },
  groupStudent:  { findMany: async () => F().groupStudents },
  lessonSession: { findMany: async ({ where }) => F().sessions.filter((s) => matchDate(s, 'date', where)) },
  payment:       { findMany: async ({ where }) => F().payments.filter((p) => matchDate(p, 'paymentDate', where)) },
  attendance:    {
    findMany: async ({ where }) => {
      const ids = new Set(where.sessionId.in)
      return F().attendances.filter((a) => ids.has(a.sessionId))
    },
  },
}
`

const HARNESS = `

// ── fixtura propriu-zisă ────────────────────────────────────────────────
const range = resolveRange('month')
const span = range.end.getTime() - range.start.getTime()
const at = (f) => new Date(range.start.getTime() + span * f)
const prevStart = range.start.getTime() - span
const atPrev = (f) => new Date(prevStart + span * f)

const L = (id, assignedToId, status, extra = {}) => ({
  id, assignedToId, status, source: 'INSTAGRAM',
  createdAt: at(0.3), convertedStudentId: null, nextFollowUpAt: null, ...extra,
})

globalThis.__FIXTURE__ = {
  users: [
    { id: 'u1', name: 'Ana', email: 'ana@x.md', role: 'ADMIN', active: true },
    { id: 'u2', name: 'Bogdan', email: 'b@x.md', role: 'ADMIN', active: true },
    { id: 't1', name: 'Carmen', email: 'c@x.md', role: 'TEACHER', active: true },
    { id: 't2', name: 'Dan', email: 'd@x.md', role: 'TEACHER', active: true },
  ],

  leads: [
    // Ana: 5 lead-uri, 2 convertite, 1 pierdut, 2 în lucru (unul restant)
    L('L1', 'u1', 'STUDIAZA', { createdAt: at(0.2), convertedStudentId: 's1' }),
    L('L2', 'u1', 'PLATIT'),
    L('L3', 'u1', 'CONTACTAT'),
    L('L4', 'u1', 'LOST_LEAD'),
    L('L5', 'u1', 'LEAD', { nextFollowUpAt: new Date(Date.now() - 86400000) }),
    // Bogdan: doar 2 — sub pragul de clasament
    L('L6', 'u2', 'STUDIAZA'),
    L('L7', 'u2', 'LOST_LEAD'),
    // fără responsabil
    L('L8', null, 'LEAD'),
    // pe lista de asteptare: a spus da, asteapta loc in grupa
    L('L12', 'u1', 'WAITLIST'),
    // generat automat din pagina Elevi — nu trebuie să intre nicăieri
    L('L9', 'u1', 'STUDIAZA', { source: 'ELEV' }),
    // perioada precedentă: 2 lead-uri, 1 convertit
    L('L10', 'u1', 'STUDIAZA', { createdAt: atPrev(0.3) }),
    L('L11', 'u1', 'LEAD', { createdAt: atPrev(0.6) }),
  ],

  students: [
    { id: 's1', fullName: 'Elev Unu', createdAt: at(0.8), active: true },
    { id: 's2', fullName: 'Elev Doi', createdAt: at(0.1), active: true },
    { id: 's3', fullName: 'Elev Trei', createdAt: atPrev(0.5), active: true },
    { id: 's4', fullName: 'Elev Patru', createdAt: atPrev(0.7), active: true },
  ],

  groups: [
    { id: 'g1', name: 'Grupa A', level: 'A1', teacherId: 't1', active: true, billingType: 'MONTHLY' },
    { id: 'g2', name: 'Grupa B', level: 'B1', teacherId: 't2', active: true, billingType: 'INDIVIDUAL' },
    // a doua grupa a Carmenei, cu acelasi elev: nu trebuie sa-l numere de doua ori
    { id: 'g3', name: 'Grupa C', level: 'A2', teacherId: 't1', active: true, billingType: 'MONTHLY' },
  ],

  groupStudents: [
    { id: 'gs1', groupId: 'g1', studentId: 's1', status: 'ACTIVE', statusChangedAt: null, enrolledAt: at(0.8), lessonsRemaining: 5 },
    { id: 'gs2', groupId: 'g1', studentId: 's2', status: 'ACTIVE', statusChangedAt: null, enrolledAt: at(0.1), lessonsRemaining: 3 },
    { id: 'gs3', groupId: 'g1', studentId: 's3', status: 'LEFT', statusChangedAt: at(0.9), enrolledAt: atPrev(0.5), lessonsRemaining: 0 },
    { id: 'gs4', groupId: 'g2', studentId: 's1', status: 'ACTIVE', statusChangedAt: null, enrolledAt: at(0.05), lessonsRemaining: 0 },
    { id: 'gs5', groupId: 'g3', studentId: 's1', status: 'ACTIVE', statusChangedAt: null, enrolledAt: at(0.5), lessonsRemaining: 4 },
    // a intrat luna asta, dar e pe pauza: nu se numara la 'elevi noi activi'
    { id: 'gs6', groupId: 'g1', studentId: 's4', status: 'PAUSED', statusChangedAt: null, enrolledAt: at(0.3), lessonsRemaining: 2 },
  ],

  sessions: [
    { id: 'ses1', groupId: 'g1', date: at(0.3), lessonsDeducted: true },
    { id: 'ses2', groupId: 'g1', date: at(0.6), lessonsDeducted: false },
    { id: 'ses5', groupId: 'g1', date: at(0.9), lessonsDeducted: true },
    { id: 'ses3', groupId: 'g2', date: at(0.4), lessonsDeducted: true },
    { id: 'ses4', groupId: 'g1', date: atPrev(0.5), lessonsDeducted: true },
  ],

  attendances: [
    { sessionId: 'ses1', studentId: 's1', status: 'PRESENT' },
    { sessionId: 'ses1', studentId: 's2', status: 'ABSENT' },
    { sessionId: 'ses2', studentId: 's1', status: 'PRESENT' },
    { sessionId: 'ses2', studentId: 's2', status: 'PRESENT' },
    { sessionId: 'ses5', studentId: 's2', status: 'ABSENT' },
    { sessionId: 'ses3', studentId: 's1', status: 'ABSENT' },
    { sessionId: 'ses4', studentId: 's1', status: 'PRESENT' },
    { sessionId: 'ses4', studentId: 's2', status: 'PRESENT' },
  ],

  payments: [
    { id: 'p1', amount: 500, debt: 0, paymentDate: at(0.2), groupStudentId: 'gs1' },
    { id: 'p2', amount: 300, debt: 100, paymentDate: at(0.4), groupStudentId: 'gs4' },
    { id: 'p3', amount: 400, debt: 0, paymentDate: atPrev(0.5), groupStudentId: 'gs1' },
  ],
}

// ── verificări ──────────────────────────────────────────────────────────
let failed = 0
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log((ok ? 'OK   ' : 'GRESIT') + ' ' + name + ' = ' + JSON.stringify(got) + (ok ? '' : '  (asteptat ' + JSON.stringify(want) + ')'))
}

const out = await buildStatistics({ period: 'month' })

console.log('--- LEAD-URI ---')
eq('total (fara cele din Elevi)', out.leads.total, 9)
eq('castigate (waitlist + platit + studiaza)', out.leads.converted, 4)
eq('rata conversie', out.leads.conversionRate, 44.4)
eq('rata precedenta', out.leads.prevConversionRate, 50)
eq('crestere fata de luna trecuta', out.leads.totalDelta, 350)
eq('pierdute', out.leads.lost, 2)
eq('in lucru', out.leads.inProgress, 3)
eq('follow-up restante', out.leads.overdueFollowUps, 1)
eq('palnie', out.leads.funnel.map((s) => s.value), [9, 5, 4, 4, 4])

console.log('--- RESPONSABILI ---')
eq('clasati', out.owners.ranked.map((o) => o.name), ['Ana'])
eq('Ana: lead-uri', out.owners.ranked[0].total, 6)
eq('Ana: conversie (L1, L2, L12)', out.owners.ranked[0].conversionRate, 50)
eq('Ana: pierdute', out.owners.ranked[0].lostRate, 16.7)
eq('Ana: restante', out.owners.ranked[0].overdue, 1)
eq('prea putine date', out.owners.tooFew.map((o) => o.name), ['Bogdan'])
eq('fara responsabil', out.owners.unassigned, 1)

console.log('--- SCOALA ---')
eq('elevi activi', out.school.studentsActive, 2)
eq('elevi noi', out.school.newStudents, 2)
eq('plecari', out.school.left, 1)
eq('retentie', out.school.retentionRate, 66.7)
eq('churn', out.school.churnRate, 33.3)
eq('inscrieri in grupe (gs1,gs2,gs4,gs5,gs6)', out.school.enrolled, 5)
eq('lectii', out.school.lessons, 4)
eq('incasari', out.school.revenue, 800)
eq('crestere incasari', out.school.revenueDelta, 100)
eq('datorii', out.school.debt, 100)
eq('incasari / elev', out.school.revenuePerStudent, 400)

console.log('--- PROFESORI ---')
const carmen = out.teachers.ranked.find((t) => t.name === 'Carmen')
const dan = out.teachers.ranked.find((t) => t.name === 'Dan')
eq('Carmen: elevi activi (s1 in doua grupe, numarat o data)', carmen.studentsActive, 2)
 eq('Carmen: grupe active', carmen.groupsActive, 2)
eq('Carmen: elevi noi (fara cel pus pe pauza)', carmen.studentsNew, 2)
 eq('noi nu poate depasi elevii activi', carmen.studentsNew <= carmen.studentsActive, true)
eq('Carmen: plecari', carmen.left, 1)
eq('Carmen: lectii', carmen.lessons, 3)
eq('Carmen: lectii inchise %', carmen.closingRate, 66.7)
eq('Carmen: prezenta %', carmen.attendanceRate, 60)
eq('Carmen: retentie %', carmen.retentionRate, 66.7)
eq('Carmen: incasari', carmen.revenue, 500)
eq('Carmen: crestere lectii', carmen.lessonsDelta, 200)
eq('Carmen: scor', carmen.score, 64)
eq('Dan: prezenta %', dan.attendanceRate, 0)
eq('Dan: retentie %', dan.retentionRate, 100)
eq('Dan: scor', dan.score, 55)
eq('ordinea in clasament', out.teachers.ranked.map((t) => t.name), ['Carmen', 'Dan'])

console.log('--- ABSENTE ---')
eq('prezenta generala %', out.absence.attendanceRate, 50)
eq('prezenta perioada precedenta %', out.absence.prevAttendanceRate, 100)
eq('prezente', out.absence.present, 3)
eq('absente', out.absence.absent, 3)
eq('elevi cu risc', out.absence.atRisk.map((s) => s.name), ['Elev Doi'])
eq('Elev Doi: rata absenta', out.absence.atRisk[0].absenceRate, 66.7)
eq('grupe cu absente', out.absence.worstGroups.map((g) => g.name), ['Grupa A'])
eq('Grupa A: rata absenta', out.absence.worstGroups[0].absenceRate, 40)
eq('Grupa A: profesor', out.absence.worstGroups[0].teacher, 'Carmen')
eq('elevi cu pachetul pe zero', out.absence.outOfLessons.map((s) => s.name), ['Elev Unu'])

console.log('--- SURSE ---')
const insta = out.leads.bySource.find((s) => s.source === 'INSTAGRAM')
eq('Instagram: total', insta.total, 9)
eq('Instagram: rata', insta.rate, 44.4)
eq('sursa ELEV nu apare', out.leads.bySource.some((s) => s.source === 'ELEV'), false)

console.log('--- EVOLUTIE ---')
eq('12 luni', out.evolution.length, 12)
const thisMonth = out.evolution[out.evolution.length - 1]
eq('luna curenta: lead-uri', thisMonth.leads, 9)
eq('luna curenta: convertite', thisMonth.converted, 4)
eq('luna curenta: elevi noi', thisMonth.newStudents, 2)
eq('luna curenta: plecari', thisMonth.left, 1)
eq('luna curenta: lectii', thisMonth.lessons, 4)
eq('luna curenta: incasari', thisMonth.revenue, 800)
eq('luna curenta: net', thisMonth.net, 1)

console.log('')
console.log(failed === 0 ? 'TOATE VERIFICARILE AU TRECUT' : failed + ' VERIFICARI AU PICAT')
process.exit(failed === 0 ? 0 : 1)
`

const src = fs.readFileSync('lib/statistics.js', 'utf8')
  .replace("import prisma from '@/lib/prisma'", FAKE_PRISMA)

const outFile = new URL('./_statistics-fixture.mjs', import.meta.url)
fs.writeFileSync(outFile, src + HARNESS)
const { default: _ } = await import(outFile.href).catch((e) => { console.error(e); process.exit(1) })
