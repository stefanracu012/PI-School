import prisma from '@/lib/prisma'
import { phoneKey, sameName } from '@/lib/duplicates'

/**
 * Fiecare elev are un lead al lui, cu statusul care spune unde se află.
 *
 *   în grupă activă (și activ în ea)      → Studiază
 *   a fost în grupe, dar a plecat din toate → A plecat
 *   în nicio grupă (ex. „începe din sept.") → Waitlist
 *
 * Legătura elev ↔ lead e Lead.convertedStudentId — aceeași folosită când un
 * lead devine elev. E esențial s-o punem din prima: un lead pe „Studiază" fără
 * elev legat ar crea automat un elev nou, adică exact dublura de evitat.
 *
 * Fără notificări pe Telegram: e evidență internă, nu un client nou.
 */

const STUDENT_SOURCE_DETAIL = 'Creat automat din pagina Elevi'

// Stările pe care le mută sincronizarea singură. Un status pus de mână
// (Programat, Așteptăm plata…) nu se atinge — cu o excepție: dacă elevul chiar
// învață într-o grupă activă, asta e realitatea și devine „Studiază".
const AUTO_STATUSES = ['WAITLIST', 'STUDIAZA', 'PLECAT']

const GONE = ['LEFT', 'COMPLETED', 'TRANSFERRED']

const studentSelect = {
  id: true,
  fullName: true,
  parentName: true,
  parentPhone: true,
  parentEmail: true,
  age: true,
  isAdult: true,
  level: true,
  lessonType: true,
  locationType: true,
  groupStudents: {
    select: { status: true, group: { select: { active: true } } },
  },
}

/** Unde se află elevul, tradus în status de lead. */
export function statusForStudent(student) {
  const memberships = student.groupStudents || []

  const studying = memberships.some(
    (gs) => (gs.status || 'ACTIVE') === 'ACTIVE' && gs.group?.active
  )
  if (studying) return 'STUDIAZA'

  if (memberships.length > 0 && memberships.every((gs) => GONE.includes(gs.status))) {
    return 'PLECAT'
  }

  return 'WAITLIST'
}

function shouldChange(current, next) {
  if (current === next) return false
  if (next === 'STUDIAZA') return true
  return AUTO_STATUSES.includes(current)
}

/** Datele lead-ului, așa cum le-ar introduce un om: contactul e părintele. */
function leadDataFromStudent(student, status) {
  const isChildWithParent = !student.isAdult && !!student.parentName?.trim()
  return {
    name: isChildWithParent ? student.parentName.trim() : student.fullName,
    studentName: isChildWithParent ? student.fullName : null,
    phone: student.parentPhone || null,
    email: student.parentEmail || null,
    isAdult: !!student.isAdult,
    studentAge: student.isAdult ? null : (student.age ?? null),
    interestedIn: student.level || null,
    lessonType: student.lessonType || null,
    locationType: student.locationType || null,
    source: 'ELEV',
    sourceDetail: STUDENT_SOURCE_DETAIL,
    status,
    convertedStudentId: student.id,
  }
}

/**
 * Un lead existent, nelegat încă, care e de fapt acest elev?
 * Telefonul decide primul; numele doar dacă telefoanele nu se contrazic.
 */
function findUnlinkedMatch(student, leads) {
  const phone = phoneKey(student.parentPhone)

  if (phone) {
    const byPhone = leads.find((l) => !l.convertedStudentId && phoneKey(l.phone) === phone)
    if (byPhone) return byPhone
  }

  return leads.find((l) => {
    if (l.convertedStudentId) return false
    const nameFits = sameName(l.studentName || l.name, student.fullName) ||
      sameName(l.name, student.fullName)
    if (!nameFits) return false
    // Nume identic, dar alt telefon → alt om; nu legăm
    const leadPhone = phoneKey(l.phone)
    return !phone || !leadPhone || leadPhone === phone
  }) || null
}

/**
 * Ce trebuie făcut pentru un elev: creat, legat, actualizat sau nimic.
 * Nu scrie nimic — doar hotărăște.
 */
function planFor(student, leads) {
  const status = statusForStudent(student)
  const linked = leads.find((l) => l.convertedStudentId === student.id)

  if (linked) {
    return shouldChange(linked.status, status)
      ? { action: 'update', lead: linked, status }
      : { action: 'none', lead: linked, status }
  }

  const match = findUnlinkedMatch(student, leads)
  if (match) {
    // Omul e acum elev: statusul vechi de prospect (Contactat, Programat…)
    // nu mai spune adevărul. De aici încolo, statusurile puse de mână se
    // respectă — vezi shouldChange.
    return { action: 'link', lead: match, status }
  }

  return { action: 'create', status }
}

async function apply(student, plan) {
  if (plan.action === 'create') {
    return prisma.lead.create({ data: leadDataFromStudent(student, plan.status) })
  }
  if (plan.action === 'link') {
    return prisma.lead.update({
      where: { id: plan.lead.id },
      data: { convertedStudentId: student.id, status: plan.status },
    })
  }
  if (plan.action === 'update') {
    return prisma.lead.update({ where: { id: plan.lead.id }, data: { status: plan.status } })
  }
  return null
}

const leadSelect = {
  id: true, name: true, studentName: true, phone: true, status: true, convertedStudentId: true,
}

/** Un singur elev — apelat după creare sau după schimbări în grupe. */
export async function syncLeadForStudent(studentId) {
  if (!studentId) return null
  try {
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: studentSelect })
    if (!student) return null

    const leads = await prisma.lead.findMany({ select: leadSelect })
    const plan = planFor(student, leads)
    await apply(student, plan)
    return plan.action
  } catch (e) {
    // Evidența de lead-uri nu trebuie să strice salvarea elevului
    console.error('[student-leads]', studentId, e?.message)
    return null
  }
}

/** Toți elevii dintr-o dată. Cu dryRun: doar raportul, fără scrieri. */
export async function syncAllStudents({ dryRun = false } = {}) {
  const [students, leads] = await Promise.all([
    prisma.student.findMany({ select: studentSelect, orderBy: { fullName: 'asc' } }),
    prisma.lead.findMany({ select: leadSelect }),
  ])

  const report = { create: [], link: [], update: [], none: 0, errors: [] }
  const byStatus = { STUDIAZA: 0, WAITLIST: 0, PLECAT: 0 }

  for (const student of students) {
    const plan = planFor(student, leads)
    byStatus[plan.status] = (byStatus[plan.status] || 0) + 1

    if (plan.action === 'none') { report.none++; continue }

    const row = {
      student: student.fullName,
      status: plan.status,
      lead: plan.lead ? (plan.lead.studentName || plan.lead.name) : null,
    }

    if (!dryRun) {
      try {
        const saved = await apply(student, plan)
        // Lead-ul nou sau legat intră în listă, ca următorul elev să nu-l ia și el
        if (saved && plan.action !== 'update') {
          const idx = leads.findIndex((l) => l.id === saved.id)
          const entry = { ...saved, convertedStudentId: student.id }
          if (idx >= 0) leads[idx] = entry
          else leads.push(entry)
        }
      } catch (e) {
        report.errors.push(`${student.fullName}: ${e.message}`)
        continue
      }
    } else if (plan.action === 'link') {
      // Și la repetiție: lead-ul „luat" nu mai e disponibil pentru alții
      plan.lead.convertedStudentId = student.id
    }

    report[plan.action].push(row)
  }

  return {
    dryRun,
    students: students.length,
    created: report.create.length,
    linked: report.link.length,
    updated: report.update.length,
    unchanged: report.none,
    byStatus,
    samples: {
      create: report.create.slice(0, 15),
      link: report.link.slice(0, 15),
      update: report.update.slice(0, 15),
    },
    errors: report.errors,
  }
}
