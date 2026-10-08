// Verifică filtrele pentru grupele încheiate: o grupă veche (fără câmpul
// completedAt în document) trebuie să fie „în curs", nu să dispară.
//
//   node scripts/test-group-filters.mjs

import { NOT_COMPLETED, IS_COMPLETED } from '../lib/group-filters.js'

let failed = 0
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log((ok ? 'OK   ' : 'GRESIT') + ' ' + name + ' = ' + JSON.stringify(got) +
    (ok ? '' : '  (asteptat ' + JSON.stringify(want) + ')'))
}

/**
 * Imită felul în care MongoDB citește filtrele Prisma, pe cele trei feluri de
 * documente pe care le avem în bază.
 */
const matches = (filter, doc) => {
  const has = Object.prototype.hasOwnProperty.call(doc, 'completedAt')
  const value = doc.completedAt

  if (filter.OR) return filter.OR.some((f) => matches(f, doc))

  const cond = filter.completedAt
  if (cond === null) return has && value === null

  if (cond && typeof cond === 'object') {
    if (cond.isSet === false && has) return false
    if (cond.isSet === true && !has) return false
    if ('not' in cond && cond.not === null && (!has || value === null)) return false
  }
  return true
}

// Cele trei stări reale din bază
const veche = {}                                   // creata inainte de camp
const incheiata = { completedAt: '2026-09-27' }    // marcata terminata
const redeschisa = { completedAt: null }           // marcata, apoi redeschisa

console.log('--- grupa veche, fara campul completedAt ---')
eq('e in curs', matches(NOT_COMPLETED, veche), true)
eq('nu e terminata', matches(IS_COMPLETED, veche), false)

console.log('--- grupa incheiata ---')
eq('nu e in curs', matches(NOT_COMPLETED, incheiata), false)
eq('e terminata', matches(IS_COMPLETED, incheiata), true)

console.log('--- grupa redeschisa (completedAt scris null) ---')
eq('e in curs', matches(NOT_COMPLETED, redeschisa), true)
eq('nu e terminata', matches(IS_COMPLETED, redeschisa), false)

console.log('--- capcana de dinainte ---')
eq('filtrul vechi { completedAt: null } pierdea grupele vechi',
  matches({ completedAt: null }, veche), false)

console.log('')
console.log(failed === 0 ? 'TOATE VERIFICARILE AU TRECUT' : failed + ' VERIFICARI AU PICAT')
process.exit(failed === 0 ? 0 : 1)
