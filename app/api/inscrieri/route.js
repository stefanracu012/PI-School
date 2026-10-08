import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { levelFromClasa } from '@/lib/levels'
import { createSiteLead } from '@/lib/site-leads'

/**
 * Formularul public /inscriere. Fiecare trimitere devine un lead în CRM
 * (sursa SITE), cu copilul, clasa lui și cursurile alese.
 */
export async function POST(request) {
  try {
    // Rate limiting: 1 request per minute
    const clientIP = getClientIP(request)
    const rateLimitKey = `inscrieri:${clientIP}`
    const { success, resetIn } = checkRateLimit(rateLimitKey, 1, 60000)

    if (!success) {
      return NextResponse.json(
        { error: `Prea multe cereri. Încercați din nou în ${Math.ceil(resetIn / 1000)} secunde.` },
        {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(resetIn / 1000))
          }
        }
      )
    }

    const data = await request.json()

    const { numeParinte, numeCopil, email, telefon, clasa, cursuriSelectate, mesaj } = data

    // Validare
    if (!numeParinte || !numeCopil || !email || !telefon || !clasa || !cursuriSelectate) {
      return NextResponse.json(
        { error: 'Toate câmpurile obligatorii trebuie completate' },
        { status: 400 }
      )
    }

    // Convertește cursuri în array dacă e string
    let cursuriArray = cursuriSelectate
    if (typeof cursuriSelectate === 'string') {
      cursuriArray = [cursuriSelectate]
    } else if (!Array.isArray(cursuriSelectate)) {
      cursuriArray = []
    }

    // Obține numele cursurilor din baza de date
    const cursuriNume = []
    for (const cursId of cursuriArray) {
      if (cursId === 'selectam-impreuna') {
        cursuriNume.push('Selectăm împreună')
      } else if (/^[a-f0-9]{24}$/i.test(String(cursId))) {
        const curs = await prisma.course.findUnique({
          where: { id: cursId },
          select: { title: true }
        })
        cursuriNume.push(curs?.title || cursId)
      } else {
        cursuriNume.push(String(cursId))
      }
    }

    const message = [
      `Formular de înscriere de pe site — Cursuri: ${cursuriNume.join(', ') || '—'}`,
      mesaj?.trim(),
    ].filter(Boolean).join('\n')

    const lead = await createSiteLead({
      name: String(numeParinte).trim().slice(0, 120),
      email: String(email).trim().slice(0, 160),
      phone: String(telefon).trim().slice(0, 40),
      message: message.slice(0, 2000),
      sourceDetail: 'pischool.md/inscriere',
      child: { name: String(numeCopil).trim().slice(0, 120), level: levelFromClasa(clasa) },
    })

    return NextResponse.json({ success: true, id: lead.id })
  } catch (error) {
    console.error('Eroare la înscriere:', error)
    return NextResponse.json(
      { error: 'A apărut o eroare la procesarea cererii' },
      { status: 500 }
    )
  }
}

// Fără GET public: lista de lead-uri conține date personale și se citește
// exclusiv autentificat, prin /api/admin/leads.
