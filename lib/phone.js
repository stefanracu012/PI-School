/**
 * Normalizarea numerelor de telefon pentru WhatsApp.
 *
 * Aceleași număr poate fi scris în mai multe feluri, toate valide:
 *   068046719        → local, cu 0 în față
 *   68046719         → local, fără 0
 *   37368046719      → cu prefix de țară
 *   +373 68 046 719  → cu plus și spații
 * wa.me acceptă doar forma internațională, fără plus: 37368046719
 */

const DEFAULT_COUNTRY_CODE = '373' // Moldova
const LOCAL_NUMBER_LENGTH = 8      // numerele naționale au 8 cifre după prefix

export function toWhatsAppNumber(phone, countryCode = DEFAULT_COUNTRY_CODE) {
  if (!phone) return null

  let digits = String(phone).replace(/\D/g, '')
  if (!digits) return null

  // Prefix internațional scris ca 00 (ex. 0037368046719)
  if (digits.startsWith('00')) digits = digits.slice(2)

  // Deja în format internațional
  if (digits.startsWith(countryCode) && digits.length > LOCAL_NUMBER_LENGTH) {
    return digits
  }

  // Local cu 0 în față: 068046719
  if (digits.startsWith('0') && digits.length === LOCAL_NUMBER_LENGTH + 1) {
    return countryCode + digits.slice(1)
  }

  // Local fără 0: 68046719
  if (digits.length === LOCAL_NUMBER_LENGTH) {
    return countryCode + digits
  }

  // Număr străin, deja cu prefixul lui de țară — îl lăsăm așa cum e
  return digits
}

export function whatsAppLink(phone, countryCode = DEFAULT_COUNTRY_CODE) {
  const n = toWhatsAppNumber(phone, countryCode)
  return n ? `https://wa.me/${n}` : null
}
