import prisma from '@/lib/prisma'
import { childrenOf } from '@/lib/lead-children'

/**
 * Conversia unui lead în elevi.
 *
 * Când lead-ul ajunge la un status câștigat (a plătit / studiază), elevii
 * apar automat în lista de elevi. Un lead poate avea mai mulți copii — un
 * părinte se interesează des pentru doi-trei odată — și atunci se creează
 * câte un elev pentru fiecare, toți cu același părinte și același telefon.
 *
 * Legătura se ține în Lead.convertedStudentIds (și, pentru tot codul scris
 * înainte, în convertedStudentId = primul elev), deci o a doua trecere prin
 * același status nu mai creează duplicate.
 */

// Statusurile care înseamnă „s-a transformat în client"
export const WON_LEAD_STATUSES = ['PLATIT', 'STUDIAZA']

export function isWonStatus(status) {
  return WON_LEAD_STATUSES.includes(status)
}

/** Notița care spune de unde a venit elevul. */
function traceNote(lead, level) {
  const parts = [`Creat automat din lead (${new Date().toLocaleDateString('ro-RO')})`]
  if (level) parts.push(`Nivel: ${level}`)
  if (lead.message) parts.push(lead.message)
  return parts.join(' · ')
}

/**
 * Creează elevii din lead, dacă nu există deja.
 * @returns {{ created: boolean, studentId: string|null, studentIds: string[], count: number, error?: string }}
 */
export async function convertLeadToStudent(lead) {
  if (!lead) return { created: false, studentId: null, studentIds: [], count: 0 }

  const already = lead.convertedStudentIds?.length
    ? lead.convertedStudentIds
    : (lead.convertedStudentId ? [lead.convertedStudentId] : [])

  if (already.length > 0) {
    return { created: false, studentId: already[0], studentIds: already, count: 0 }
  }

  try {
    const kids = childrenOf(lead)

    // Fără niciun copil trecut, persoana de contact e chiar elevul — cazul
    // adultului care se înscrie pe el însuși.
    const rows = kids.length > 0
      ? kids.map((c) => ({
          fullName: c.name,
          age: c.age ?? null,
          isAdult: c.isAdult,
          level: c.level || null,
          lessonType: c.lessonType || null,
          locationType: c.locationType || null,
          parentName: lead.name,
          parentPhone: lead.phone || null,
          parentEmail: lead.email || null,
          notes: traceNote(lead, c.level),
        }))
      : [{
          fullName: lead.name,
          age: lead.studentAge ?? null,
          isAdult: !!lead.isAdult,
          level: lead.interestedIn || null,
          lessonType: lead.lessonType || null,
          locationType: lead.locationType || null,
          parentName: null,
          parentPhone: lead.phone || null,
          parentEmail: lead.email || null,
          notes: traceNote(lead, lead.interestedIn),
        }]

    const created = []
    for (const data of rows) {
      const student = await prisma.student.create({ data })
      created.push(student.id)
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: { convertedStudentId: created[0], convertedStudentIds: created },
    })

    return { created: true, studentId: created[0], studentIds: created, count: created.length }
  } catch (e) {
    // Conversia nu trebuie să pice schimbarea de status a lead-ului
    console.error('Lead → student conversion error:', e)
    return { created: false, studentId: null, studentIds: [], count: 0, error: e.message }
  }
}
