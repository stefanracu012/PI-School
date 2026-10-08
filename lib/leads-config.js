import { whatsAppLink } from '@/lib/phone'

/**
 * Sursa unică de adevăr pentru pipeline-ul de leads.
 * Folosită deopotrivă de UI (etichete, culori, filtre) și de API (validare).
 */

// ── Statusuri ─────────────────────────────────────────────────────────────
// Ordinea de aici este ordinea din pipeline și din toate dropdown-urile.
export const LEAD_STATUSES = [
  { value: 'LEAD', label: 'New lead', emoji: '🔵', color: 'bg-blue-100 text-blue-800 border-blue-300', group: 'nou' },
  { value: 'FARA_RASPUNS', label: 'Fără răspuns', emoji: '🔘', color: 'bg-gray-100 text-gray-700 border-gray-300', group: 'lucru' },
  { value: 'CONTACTAT', label: 'Contactat', emoji: '🟡', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', group: 'lucru' },
  // Revenirile după primul contact, în ordine — cu cât mai multe, cu atât mai cald colorat
  { value: 'FOLLOW_UP_1', label: 'Follow up 1', emoji: '📞', color: 'bg-yellow-50 text-yellow-800 border-yellow-200', group: 'lucru' },
  { value: 'FOLLOW_UP_2', label: 'Follow up 2', emoji: '📲', color: 'bg-amber-50 text-amber-800 border-amber-200', group: 'lucru' },
  { value: 'FOLLOW_UP_2_PLUS', label: 'Follow up 2+', emoji: '🔁', color: 'bg-orange-50 text-orange-800 border-orange-200', group: 'lucru' },
  { value: 'PROGRAMAT_TESTARE', label: 'Programat testare', emoji: '📝', color: 'bg-sky-100 text-sky-800 border-sky-300', group: 'lucru' },
  { value: 'PRIMA_LECTIE', label: 'Prima lecție', emoji: '🟢', color: 'bg-green-100 text-green-800 border-green-300', group: 'lucru' },
  { value: 'FINALIZAT_LECTIA', label: 'Finalizat lecția', emoji: '⚫', color: 'bg-slate-200 text-slate-800 border-slate-400', group: 'lucru' },
  { value: 'SE_GANDESTE', label: 'Se gândește', emoji: '🤔', color: 'bg-gray-100 text-gray-600 border-gray-300', group: 'lucru' },
  { value: 'INTERESAT_MAI_TARZIU', label: 'Interesat mai târziu', emoji: '🗓️', color: 'bg-stone-100 text-stone-700 border-stone-300', group: 'lucru' },
  { value: 'WAITLIST', label: 'Waitlist', emoji: '📋', color: 'bg-teal-100 text-teal-800 border-teal-300', group: 'lucru' },
  { value: 'ASTEPTAM_PLATA', label: 'Așteptăm plata', emoji: '💵', color: 'bg-amber-100 text-amber-800 border-amber-300', group: 'lucru' },
  { value: 'PLATIT', label: 'A plătit', emoji: '💰', color: 'bg-emerald-100 text-emerald-800 border-emerald-300', group: 'castigat' },
  { value: 'STUDIAZA', label: 'Studiază', emoji: '🟣', color: 'bg-purple-100 text-purple-800 border-purple-300', group: 'castigat' },
  { value: 'PLECAT', label: 'A plecat', emoji: '🔴', color: 'bg-red-100 text-red-800 border-red-300', group: 'pierdut' },
  { value: 'LOST_LEAD', label: 'Lead pierdut', emoji: '❌', color: 'bg-red-200 text-red-900 border-red-400', group: 'pierdut' },
  { value: 'OLD_STUDENT', label: 'Old student', emoji: '🎒', color: 'bg-lime-100 text-lime-800 border-lime-300', group: 'lucru' },
  { value: 'TEST', label: 'Test', emoji: '🧪', color: 'bg-cyan-100 text-cyan-800 border-cyan-300', group: 'lucru' },
]

export const LEAD_STATUS_VALUES = LEAD_STATUSES.map((s) => s.value)

// Statusuri scoase din uz: nu se mai pot alege, dar lead-urile rămase pe
// ele trebuie să se vadă ca lumea până le mută cineva mai departe.
const RETIRED_STATUSES = [
  { value: 'PROGRAMAT', label: 'Programat (scos din uz)', emoji: '🟠', color: 'bg-orange-50 text-orange-700 border-orange-200', group: 'lucru' },
]

// Opțiunile unui <select> de status: cele active, plus statusul scos din uz pe
// care stă lead-ul — altfel select-ul arată prima opțiune și alegerea ei nu
// declanșează onChange.
export const statusOptionsFor = (current) => {
  const retired = RETIRED_STATUSES.find((s) => s.value === current)
  return retired ? [retired, ...LEAD_STATUSES] : LEAD_STATUSES
}

export const getStatus = (value) =>
  LEAD_STATUSES.find((s) => s.value === value) ||
  RETIRED_STATUSES.find((s) => s.value === value) || {
    value,
    label: value,
    emoji: '⚪',
    color: 'bg-gray-100 text-gray-600 border-gray-300',
    group: 'lucru',
  }

// ── Surse ─────────────────────────────────────────────────────────────────
// `detailLabel` = ce se cere în câmpul liber când sursa e selectată.
// `link` = cum deschizi conversația direct din CRM (primește lead-ul).
export const LEAD_SOURCES = [
  {
    value: 'INSTAGRAM', label: 'Instagram', emoji: '📸',
    color: 'bg-pink-100 text-pink-800',
    detailLabel: 'Utilizator Instagram (ex: @pischool.md)',
    link: (l) => (l.sourceDetail ? `https://instagram.com/${l.sourceDetail.replace(/^@/, '')}` : null),
  },
  {
    value: 'MESSENGER', label: 'Messenger', emoji: '💬',
    color: 'bg-indigo-100 text-indigo-800',
    detailLabel: 'Profil Messenger (nume sau link)',
    link: (l) => (l.sourceDetail?.startsWith('http') ? l.sourceDetail : null),
  },
  {
    value: 'FACEBOOK', label: 'Facebook', emoji: '📘',
    color: 'bg-blue-100 text-blue-800',
    detailLabel: 'Profil Facebook (nume sau link)',
    link: (l) => (l.sourceDetail?.startsWith('http') ? l.sourceDetail : null),
  },
  {
    value: 'WHATSAPP', label: 'WhatsApp', emoji: '🟢',
    color: 'bg-green-100 text-green-800',
    detailLabel: 'Număr WhatsApp (dacă diferă de telefon)',
    link: (l) => whatsAppLink(l.sourceDetail || l.phone),
  },
  {
    value: 'TELEGRAM', label: 'Telegram', emoji: '✈️',
    color: 'bg-sky-100 text-sky-800',
    detailLabel: 'Utilizator Telegram (ex: @nume)',
    link: (l) => (l.sourceDetail ? `https://t.me/${l.sourceDetail.replace(/^@/, '')}` : null),
  },
  {
    value: 'TIKTOK', label: 'TikTok', emoji: '🎵',
    color: 'bg-neutral-200 text-neutral-800',
    detailLabel: 'Utilizator TikTok',
    link: (l) => (l.sourceDetail ? `https://tiktok.com/@${l.sourceDetail.replace(/^@/, '')}` : null),
  },
  {
    value: 'TELEFON', label: 'Telefon', emoji: '📞',
    color: 'bg-teal-100 text-teal-800',
    detailLabel: 'Detalii apel (opțional)',
    link: (l) => (l.phone ? `tel:${l.phone}` : null),
  },
  {
    value: 'RECOMANDARE', label: 'Recomandare', emoji: '🤝',
    color: 'bg-violet-100 text-violet-800',
    detailLabel: 'Cine a recomandat',
    link: () => null,
  },
  {
    value: 'WALK_IN', label: 'A venit la sediu', emoji: '🚪',
    color: 'bg-orange-100 text-orange-800',
    detailLabel: 'Filiala / detalii',
    link: () => null,
  },
  {
    value: 'SITE', label: 'Formular site', emoji: '🌐',
    color: 'bg-cyan-100 text-cyan-800',
    detailLabel: 'Pagina de proveniență',
    link: () => null,
  },
  {
    // Nu se alege de mână: îl pune CRM-ul când lead-ul pornește dintr-un elev
    value: 'ELEV', label: 'Pagina Elevi', emoji: '🎓',
    color: 'bg-emerald-100 text-emerald-800',
    detailLabel: 'Detalii',
    link: () => null,
  },
  {
    value: 'ALTA', label: 'Altă sursă', emoji: '❓',
    color: 'bg-gray-100 text-gray-700',
    detailLabel: 'Descrie sursa',
    link: () => null,
  },
]

export const LEAD_SOURCE_VALUES = LEAD_SOURCES.map((s) => s.value)

export const getSource = (value) =>
  LEAD_SOURCES.find((s) => s.value === value) || {
    value,
    label: value || 'Necunoscută',
    emoji: '❓',
    color: 'bg-gray-100 text-gray-700',
    detailLabel: 'Detalii',
    link: () => null,
  }
