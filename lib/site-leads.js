import prisma from '@/lib/prisma'
import { notifyNewLead } from '@/lib/telegram'
import { normalizeChildren, mirrorOfFirstChild } from '@/lib/lead-children'

/**
 * Cererile de pe site-ul public PI School (/inscriere, înscrierea la un curs)
 * intră în CRM ca lead-uri cu sursa SITE — la fel ca formularul de contact.
 *
 * @param {object} data
 * @param {string} data.name          persoana de contact (părintele)
 * @param {string} [data.phone]
 * @param {string} [data.email]
 * @param {string} [data.message]     contextul: cursurile alese, observațiile
 * @param {string} [data.sourceDetail] de unde a venit (ex. „pischool.md/inscriere")
 * @param {object} [data.child]       { name, age, level } — copilul care învață
 */
export async function createSiteLead({ name, phone, email, message, sourceDetail, child }) {
  const children = normalizeChildren(child ? [child] : [])

  const lead = await prisma.lead.create({
    data: {
      name,
      phone: phone || null,
      email: email || null,
      message: message || null,
      source: 'SITE',
      sourceDetail: sourceDetail || 'pischool.md',
      status: 'LEAD',
      children,
      ...(mirrorOfFirstChild(children) || {}),
    },
  })

  // Notificarea nu trebuie să strice trimiterea: lead-ul e deja salvat
  await notifyNewLead(lead).catch((e) => console.error('Notificare lead nou:', e?.message))

  return lead
}
