/**
 * Aducerea datelor vechi PI School la schema CRM-ului (cea de la Olla).
 *
 * 1. Câmpuri obligatorii noi. În MongoDB documentele vechi pur și simplu nu
 *    le au, iar Prisma refuză să citească un câmp obligatoriu lipsă — pagina
 *    cade cu „server error". În plus, filtrele de tip `active: true` nu prind
 *    documentele fără câmp, așa că elevii vechi ar dispărea din liste.
 *    Le completăm cu valorile implicite din schema.prisma.
 *
 * 2. Înscrierile, înscrierile la cursuri și mesajele de contact primite pe
 *    site înainte de CRM devin lead-uri (cu notițele lor), ca tot pipeline-ul
 *    să fie într-un singur loc. Fiecare import e marcat în `sourceDetail`, deci
 *    rularea repetată nu dublează nimic.
 *
 * Rulează automat o dată per instanță de server (vezi lib/prisma.js) și
 * manual cu `npm run db:migrate-crm`. Toate operațiile sunt idempotente.
 */

// Câmpurile cu @default care lipsesc din documentele create înainte de CRM
const FIELD_DEFAULTS = {
  users: {
    active: true,
    permissions: [],
    superTeacher: false,
    canViewAllSchedules: false,
    twoFactorEnabled: false,
    twoFactorAllowed: false,
  },
  students: {
    isAdult: false,
    active: true,
    superStudent: false,
    cooldownDisabled: false,
    xpCapDisabled: false,
  },
  groups: {
    active: true,
    billingType: 'MONTHLY',
    monthlyLessons: 8,
    isTrial: false,
    cooldownDisabled: false,
    xpCapDisabled: false,
  },
  group_students: {
    lessonsRemaining: 0,
    absences: 0,
    status: 'ACTIVE',
  },
  lesson_sessions: {
    lessonsDeducted: false,
  },
  makeup_lessons: {
    lessonsDeducted: false,
  },
}

async function backfillDefaults(db, log) {
  for (const [collection, fields] of Object.entries(FIELD_DEFAULTS)) {
    const updates = Object.entries(fields).map(([field, value]) => ({
      q: { $or: [{ [field]: { $exists: false } }, { [field]: null }] },
      u: { $set: { [field]: value } },
      multi: true,
    }))
    const res = await db.$runCommandRaw({ update: collection, updates })
    if (res?.nModified > 0) log(`[migrare] ${collection}: ${res.nModified} câmpuri completate`)
  }
}

// Statusurile vechi de pe site → statusul de lead
const STATUS_MAP = {
  NOU: 'LEAD',
  NEW: 'LEAD',
  CITIT: 'CONTACTAT',
  RASPUNS: 'CONTACTAT',
  CONTACTED: 'CONTACTAT',
  CONFIRMAT: 'PROGRAMAT',
  CONFIRMED: 'PROGRAMAT',
  RESPINS: 'LOST_LEAD',
  REJECTED: 'LOST_LEAD',
  ARHIVAT: 'LOST_LEAD',
}
const LEAD_STATUSES = new Set([
  'LEAD', 'FARA_RASPUNS', 'CONTACTAT', 'PROGRAMAT', 'PRIMA_LECTIE', 'FINALIZAT_LECTIA',
  'SE_GANDESTE', 'ASTEPTAM_PLATA', 'PLATIT', 'STUDIAZA', 'PLECAT', 'LOST_LEAD', 'TEST',
])
const leadStatus = (s) => STATUS_MAP[s] || (LEAD_STATUSES.has(s) ? s : 'LEAD')

function levelFromClasa(clasa) {
  const value = String(clasa ?? '').trim()
  if (value === 'pregatitoare') return 'Clasa pregătitoare'
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? `Clasa ${n}` : null
}

function childEntry(name, age, level) {
  const clean = String(name || '').trim()
  if (!clean) return { children: [] }
  const child = { name: clean, age: Number.isFinite(age) ? age : null, isAdult: false, level: level || null, lessonType: null, locationType: null }
  return {
    children: [child],
    studentName: child.name,
    studentAge: child.age,
    isAdult: false,
    interestedIn: child.level,
  }
}

async function importLead(db, marker, data, notes, imported) {
  if (imported.has(marker)) return false
  imported.add(marker)

  const lead = await db.lead.create({
    data: { ...data, source: 'SITE', sourceDetail: marker },
  })
  const texts = notes.filter((n) => n?.content?.trim())
  if (texts.length > 0) {
    await db.leadNote.createMany({
      data: texts.map((n) => ({
        leadId: lead.id,
        content: n.content,
        authorName: 'Import site',
        createdAt: n.createdAt || new Date(),
      })),
    })
  }
  return true
}

async function importSiteLeads(db, log) {
  let created = 0

  // Ce s-a importat deja (o singură interogare, nu una pe cerere)
  const already = await db.lead.findMany({
    where: { source: 'SITE', sourceDetail: { startsWith: 'pischool.md/', contains: ' #' } },
    select: { sourceDetail: true },
  })
  const imported = new Set(already.map((l) => l.sourceDetail))

  // Formularul /inscriere
  const inscrieri = await db.inscriere.findMany({ include: { inscriereNotes: true } })
  for (const i of inscrieri) {
    const ok = await importLead(db, `pischool.md/inscriere #${i.id}`, {
      name: i.numeParinte,
      phone: i.telefon || null,
      email: i.email || null,
      message: [`Formular de înscriere de pe site — Cursuri: ${(i.cursuri || []).join(', ') || '—'}`, i.mesaj?.trim()].filter(Boolean).join('\n'),
      status: leadStatus(i.status),
      createdAt: i.createdAt,
      ...childEntry(i.numeCopil, null, levelFromClasa(i.clasa)),
    }, [{ content: i.notes, createdAt: i.updatedAt }, ...i.inscriereNotes], imported)
    if (ok) created++
  }

  // Înscrierile la un curs anume
  const courses = await db.course.findMany({ select: { id: true, title: true } })
  const courseTitle = new Map(courses.map((c) => [c.id, c.title]))
  const enrollments = await db.enrollment.findMany({ include: { enrollmentNotes: true } })
  for (const e of enrollments) {
    const ok = await importLead(db, `pischool.md/curs #${e.id}`, {
      name: e.parentName,
      phone: e.parentPhone || null,
      email: e.parentEmail || null,
      message: [
        `Înscriere de pe site la cursul „${courseTitle.get(e.courseId) || 'curs șters'}"`,
        e.city && `Oraș: ${e.city}`,
        e.observations && `Observații: ${e.observations}`,
      ].filter(Boolean).join('\n'),
      status: leadStatus(e.status),
      createdAt: e.createdAt,
      ...childEntry(e.studentName, e.studentAge, null),
    }, [{ content: e.notes, createdAt: e.updatedAt }, ...e.enrollmentNotes], imported)
    if (ok) created++
  }

  // Mesajele de contact
  const messages = await db.contactMessage.findMany({ include: { contactNotes: true } })
  for (const m of messages) {
    const ok = await importLead(db, `pischool.md/contact #${m.id}`, {
      name: m.name,
      phone: m.phone || null,
      email: m.email || null,
      message: m.message,
      status: leadStatus(m.status),
      createdAt: m.createdAt,
      children: [],
    }, [{ content: m.notes, createdAt: m.updatedAt }, ...m.contactNotes], imported)
    if (ok) created++
  }

  if (created > 0) log(`[migrare] ${created} cereri vechi de pe site importate ca lead-uri`)
}

// Marcajul din external_cache: odată pus, pornirile următoare nu mai fac nimic.
// Schimbă versiunea dacă adaugi o migrare nouă.
const MARKER_KEY = 'migration:pischool-crm-v1'

/** Rulează toate migrările pe un PrismaClient de bază (fără extensii). */
export async function runMigrations(db, log = console.log) {
  await backfillDefaults(db, log)
  await importSiteLeads(db, log)
  await db.externalCache.upsert({
    where: { key: MARKER_KEY },
    create: { key: MARKER_KEY, payload: { doneAt: new Date().toISOString() } },
    update: { payload: { doneAt: new Date().toISOString() } },
  })
}

/** Ca runMigrations, dar sare peste tot dacă marcajul există deja. */
export async function runMigrationsOnce(db, log = console.log) {
  const done = await db.externalCache.findUnique({ where: { key: MARKER_KEY }, select: { id: true } })
  if (done) return
  log('[migrare] Aduc datele vechi PI School la schema CRM...')
  await runMigrations(db, log)
  log('[migrare] Gata.')
}
