import { fetchInbox, pageInfo, summarize, PAGE_ID } from '@/lib/meta-messages'
import { readCache, writeCache } from '@/lib/external-cache'
import prisma from '@/lib/prisma'

/**
 * Inboxul, cu tot ce ține de păstrarea lui.
 *
 * Regula: pe ecran ajunge întotdeauna ultima citire reușită, oricât de veche.
 * Meta e lentă și uneori nu răspunde deloc — dacă am fi așteptat-o la fiecare
 * deschidere, pagina ar fi părut goală sau blocată. Împrospătarea se face în
 * fundal, iar un rezultat gol nu se salvează niciodată peste unul bun.
 */

export const INBOX_KEY = 'meta:inbox'
const SEEN_KEY = 'meta:seen'
const FRESH_MS = 20 * 1000

let refreshing = false

/** Citește de la Meta. Aruncă dacă n-a venit nimic — vezi comentariul de sus. */
export async function loadInbox() {
  const { conversations, errors } = await fetchInbox()

  if (conversations.length === 0 && errors.length > 0) {
    throw new Error(errors.join(' · '))
  }

  const page = await pageInfo().catch(() => ({ id: PAGE_ID, name: 'Pagina' }))

  return {
    page,
    conversations,
    errors,
    fetchedAt: new Date().toISOString(),
  }
}

/** Împrospătare în fundal: cine a cerut acum a primit deja datele vechi. */
export function refreshInBackground() {
  if (refreshing) return
  refreshing = true

  loadInbox()
    .then((data) => writeCache(INBOX_KEY, data))
    .catch((e) => console.error('[inbox] împrospătare eșuată:', e?.message))
    .finally(() => { refreshing = false })
}

/**
 * Ce a citit echipa. Meta ne dă „necitite" doar pe Messenger, și nici acolo
 * de încredere; pe Instagram, deloc. Așa că ținem noi minte când a fost
 * deschisă ultima oară fiecare conversație.
 */
async function readSeen() {
  const cached = await readCache(SEEN_KEY)
  return cached?.payload || {}
}

export async function markConversationSeen(conversationId) {
  if (!conversationId) return
  const seen = await readSeen()
  seen[conversationId] = new Date().toISOString()
  await writeCache(SEEN_KEY, seen)
}

/** Marchează „necitit" ce a venit după ultima deschidere și nu e scris de noi. */
function applySeen(conversations, seen) {
  return conversations.map((c) => {
    const seenAt = seen[c.id] ? new Date(seen[c.id]).getTime() : 0
    const updated = new Date(c.updatedTime || 0).getTime()

    // Ultimul mesaj e al nostru? Atunci nu are ce fi necitit.
    const theirTurn = c.lastFromPage !== true
    const afterSeen = updated > seenAt

    const unread = theirTurn && afterSeen
      ? Math.max(c.unreadCount || 0, 1)
      : 0

    return { ...c, unreadCount: unread, isNew: unread > 0 }
  })
}

/**
 * Inboxul pentru afișare.
 * Întoarce imediat ce avem; cere date noi doar dacă n-avem chiar nimic.
 */
/**
 * Lead-ul din spatele fiecărei conversații, dacă există — ca statusul să se
 * vadă și să se poată schimba direct din inbox. Se caută după conversație,
 * iar dacă n-o găsim, după persoană (lead creat înainte de legătura directă).
 */
async function attachLeads(conversations) {
  const ids = conversations.map((c) => c.id)
  const people = conversations.map((c) => c.person?.id).filter(Boolean)
  if (ids.length === 0) return conversations

  const leads = await prisma.lead.findMany({
    where: {
      OR: [
        { metaConversationId: { in: ids } },
        { metaPersonId: { in: people } },
      ],
    },
    select: { id: true, name: true, status: true, metaConversationId: true, metaPersonId: true },
  }).catch(() => [])

  const byConversation = new Map(leads.map((l) => [l.metaConversationId, l]))
  const byPerson = new Map(leads.filter((l) => l.metaPersonId).map((l) => [l.metaPersonId, l]))

  return conversations.map((c) => {
    const lead = byConversation.get(c.id) || byPerson.get(c.person?.id) || null
    return { ...c, lead: lead ? { id: lead.id, status: lead.status, name: lead.name } : null }
  })
}

export async function getInbox({ force = false } = {}) {
  const decorate = async (payload, extra) => {
    const seen = await readSeen()
    const conversations = await attachLeads(applySeen(payload.conversations, seen))
    return { ...payload, conversations, stats: summarize(conversations), ...extra }
  }

  if (!force) {
    const cached = await readCache(INBOX_KEY)

    // Un inbox gol nu merită servit: mai bine o citire adevărată decât
    // „nicio conversație" pe nedrept.
    if (cached?.payload?.conversations?.length > 0) {
      if (cached.ageMs > FRESH_MS) refreshInBackground()
      return decorate(cached.payload, {
        cached: true,
        ageMs: cached.ageMs,
        cacheFrom: cached.from,
      })
    }
  }

  const data = await loadInbox()
  await writeCache(INBOX_KEY, data)
  return decorate(data, { cached: false, ageMs: 0 })
}

/** Folosit de cron, ca datele să fie proaspete înainte să intre cineva. */
export async function warmInbox() {
  const data = await loadInbox()
  await writeCache(INBOX_KEY, data)
  return { conversations: data.conversations.length, warmedAt: data.fetchedAt }
}
