import prisma from '@/lib/prisma'
import { fetchConversations, fetchMessages, PAGE_ID, isConfigured } from '@/lib/meta-messages'
import { toWhatsAppNumber } from '@/lib/phone'

/**
 * Transformă conversațiile de pe Messenger și Instagram în lead-uri.
 *
 * Regula de bază: o conversație = un lead, o singură dată. Legătura se ține pe
 * Lead.metaConversationId, deci a doua rulare nu mai creează nimic pentru
 * aceleași discuții. Nimic nu se șterge și nimic nu se suprascrie: dacă cineva
 * a lucrat deja lead-ul, rămâne cum e.
 *
 * Funcția rulează doar când SUPERADMIN-ul a pornit comutatorul din Securitate.
 */

const PLATFORMS = [
  { platform: 'messenger', source: 'MESSENGER', label: 'Messenger' },
  { platform: 'instagram', source: 'INSTAGRAM', label: 'Instagram' },
]

/** Setările: singleton, ca peste tot în CRM. */
export async function getMetaLeadSettings() {
  const existing = await prisma.systemSettings.findFirst()
  if (existing) return existing
  return prisma.systemSettings.create({ data: {} })
}

export async function setMetaLeadsEnabled(enabled, userId = null) {
  const settings = await getMetaLeadSettings()
  return prisma.systemSettings.update({
    where: { id: settings.id },
    data: { metaLeadsEnabled: !!enabled, updatedById: userId },
  })
}

/**
 * Caută un număr de telefon în ce a scris persoana.
 *
 * Oamenii îl scriu cum apucă: „069123456", „+373 69 123 456", „0 69-12-34-56".
 * Luăm doar ce arată a număr valid de telefon (8–15 cifre) și îl trecem prin
 * normalizatorul folosit deja de CRM, ca să iasă mereu aceeași formă.
 */
function findPhone(texts) {
  // Secvențe de cifre cu separatoare uzuale, minimum 8 cifre în total
  const pattern = /(?:\+?\d[\d\-\s().]{6,}\d)/g

  for (const text of texts) {
    if (!text) continue
    const matches = text.match(pattern) || []
    for (const raw of matches) {
      const digits = raw.replace(/\D/g, '')
      if (digits.length < 8 || digits.length > 15) continue

      const normalized = toWhatsAppNumber(raw)
      if (!normalized) continue
      return `+${normalized}`
    }
  }
  return null
}

/**
 * Ce se poate afla dintr-o conversație nouă: textul, telefonul, și dacă i s-a
 * răspuns deja (caz în care lead-ul pornește direct „Contactat").
 */
async function readConversation(conversationId, snippet) {
  try {
    const messages = await fetchMessages(conversationId, 25)
    const fromPerson = messages.filter((m) => !m.fromPage && m.text)

    const phone = findPhone(fromPerson.map((m) => m.text))
    const answered = messages.some((m) => m.fromPage && m.text)

    if (fromPerson.length === 0) return { message: snippet || null, phone, answered }

    // Primul mesaj spune de ce a scris; ultimul spune unde s-a ajuns
    const first = fromPerson[0].text
    const last = fromPerson[fromPerson.length - 1].text
    const message = first === last ? first : `${first}\n\n(ultimul mesaj: ${last})`

    return { message, phone, answered }
  } catch {
    return { message: snippet || null, phone: null, answered: false }
  }
}

/**
 * Mesajele scrise de persoană după ultima verificare intră ca notițe pe lead.
 *
 * Fără notificare pe Telegram: acolo se anunță doar lead-ul nou. O discuție
 * poate avea zeci de mesaje, iar un anunț la fiecare ar face grupul de
 * nefolosit — mesajele se citesc în CRM, unde oricum se și răspunde.
 *
 * Întoarce textul ultimului mesaj nou, sau null dacă n-a scris nimic.
 */
async function handleNewMessages(lead, conversation) {
  const seenUntil = lead.metaLastMessageAt ? new Date(lead.metaLastMessageAt).getTime() : 0
  const updated = conversation.updatedTime ? new Date(conversation.updatedTime).getTime() : 0
  if (updated <= seenUntil) return null

  let messages = []
  try {
    messages = await fetchMessages(conversation.id, 25)
  } catch {
    return null
  }

  const fresh = messages.filter(
    (m) => !m.fromPage && m.text && new Date(m.createdTime).getTime() > seenUntil
  )

  const update = { metaLastMessageAt: new Date(Math.max(updated, seenUntil)) }

  // I s-a răspuns din Messenger/Instagram? Atunci e contactat — dar nu dăm
  // statusul înapoi dacă lead-ul a avansat deja mai departe.
  if (lead.status === 'LEAD' && messages.some((m) => m.fromPage && m.text)) {
    update.status = 'CONTACTAT'
  }

  // Telefonul, dacă l-a scris între timp și lead-ul n-avea unul
  if (!lead.phone) {
    const phone = findPhone(messages.filter((m) => !m.fromPage).map((m) => m.text))
    if (phone) update.phone = phone
  }

  await prisma.lead.update({ where: { id: lead.id }, data: update })

  if (fresh.length === 0) return null

  // Notițele păstrează firul în CRM, chiar dacă nimeni nu deschide Messenger
  await prisma.leadNote.createMany({
    data: fresh.map((m) => ({
      leadId: lead.id,
      content: m.text,
      authorName: `${lead.name} (mesaj primit)`,
      createdAt: new Date(m.createdTime),
    })),
  }).catch(() => {})

  return fresh[fresh.length - 1].text
}

/**
 * Sincronizează conversațiile în lead-uri.
 *
 * Se iau cele mai recente `limit` conversații de pe fiecare platformă — nu tot
 * istoricul paginii. Prima rulare nu trimite notificări pe Telegram: ar însemna
 * zeci de mesaje deodată pentru discuții vechi. Notificările pornesc de la a
 * doua rulare, adică pentru conversațiile care apar după ce ai pornit funcția.
 *
 * @param {Object} options
 * @param {number} options.limit câte conversații per platformă
 * @param {boolean} options.dryRun doar arată ce s-ar crea, fără să scrie nimic
 */
export async function syncConversationsToLeads({ limit = 25, dryRun = false } = {}) {
  if (!isConfigured()) throw new Error('META_ACCESS_TOKEN nu este setat')

  const settingsBefore = await getMetaLeadSettings()
  const firstRun = !settingsBefore.metaLeadsLastSyncAt

  const created = []
  const newMessages = []
  const skipped = { existing: 0, noPerson: 0 }
  const errors = []

  for (const { platform, source, label } of PLATFORMS) {
    let conversations = []
    try {
      const res = await fetchConversations(platform, null, limit)
      conversations = res.conversations
    } catch (e) {
      errors.push(`${label}: ${e.message}`)
      continue
    }

    for (const c of conversations) {
      if (!c.person?.id) { skipped.noPerson++; continue }

      const already = await prisma.lead.findFirst({
        where: { metaConversationId: c.id },
      })

      // Conversație deja convertită: ne interesează doar dacă a scris ceva nou
      if (already) {
        skipped.existing++
        if (!dryRun) {
          const fresh = await handleNewMessages(already, c)
          if (fresh) newMessages.push({ id: already.id, name: already.name, text: fresh })
        }
        continue
      }

      const { message, phone, answered } = await readConversation(c.id, c.snippet)

      // Repetiția uscată: doar spunem ce s-ar întâmpla
      if (dryRun) {
        created.push({
          id: c.id,
          name: c.person.name || 'Contact fără nume',
          platform: label,
          phone,
          status: answered ? 'Contactat' : 'New lead',
          updatedTime: c.updatedTime,
        })
        continue
      }

      const lead = await prisma.lead.create({
        data: {
          name: c.person.name || 'Contact fără nume',
          source,
          sourceDetail: c.person.username ? `@${c.person.username}` : label,
          message,
          phone,
          // Dacă cineva a răspuns deja din Messenger, lead-ul nu mai e „nou"
          status: answered ? 'CONTACTAT' : 'LEAD',
          metaConversationId: c.id,
          metaPlatform: platform,
          metaPersonId: c.person.id,
          metaLastMessageAt: c.updatedTime ? new Date(c.updatedTime) : new Date(),
        },
      })

      created.push({ id: lead.id, name: lead.name, platform: label })

      // Fără anunț în topicul de lead-uri: conversația de pe Messenger sau
      // Instagram a ajuns deja pe Telegram, iar al doilea mesaj pentru același
      // om nu adaugă nimic. Acolo rămâne doar digestul de recontactări.
    }
  }

  if (!dryRun) {
    const settings = await getMetaLeadSettings()
    await prisma.systemSettings.update({
      where: { id: settings.id },
      data: {
        metaLeadsLastSyncAt: new Date(),
        metaLeadsCreated: (settings.metaLeadsCreated || 0) + created.length,
      },
    })
  }

  return {
    dryRun,
    firstRun,
    created: created.length,
    createdLeads: created,
    newMessages: newMessages.length,
    newMessageLeads: newMessages,
    skipped,
    errors,
    pageId: PAGE_ID,
    syncedAt: new Date().toISOString(),
  }
}
