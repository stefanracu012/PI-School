import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { notifyNewLead } from '@/lib/telegram'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

/**
 * Formularul de pe site-ul public (pischool.md): „Rezervă o lecție de probă".
 * Fiecare trimitere devine un lead în CRM, cu sursa SITE.
 */
export async function POST(request) {
  try {
    // Rate limiting: 3 cereri pe minut de la aceeași adresă
    const clientIP = getClientIP(request)
    const { success, resetIn } = checkRateLimit(`contact:${clientIP}`, 3, 60000)

    if (!success) {
      return NextResponse.json(
        { error: `Prea multe cereri. Încercați din nou în ${Math.ceil(resetIn / 1000)} secunde.` },
        { status: 429, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.ceil(resetIn / 1000)) } }
      )
    }

    const data = await request.json()
    const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
    const name = clean(data.name, 120)
    const email = clean(data.email, 160)
    const phone = clean(data.phone, 40)
    const message = clean(data.message, 2000)
    const intent = clean(data.intent, 60)
    const course = clean(data.course, 80)
    const format = clean(data.format, 80)
    const place = ['online', 'offline'].includes(data.place) ? data.place : null

    // Câmp ascuns pe care un om nu-l completează: dacă are ceva, e robot.
    // Răspundem „ok", ca să nu afle ce l-a dat de gol.
    if (clean(data.website, 200)) return NextResponse.json({ success: true })

    if (!name || (!phone && !email)) {
      return NextResponse.json({ error: 'Numele și telefonul sunt obligatorii' }, { status: 400 })
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Adresa de email nu pare corectă' }, { status: 400 })
    }

    // Ce a bifat omul în formular, în câmpurile pe care le are deja CRM-ul
    const lessonType = /individual/i.test(format) ? 'individual' : /grup/i.test(format) ? 'grup' : null
    const interestedIn = /bacalaureat|\bbac\b/i.test(course) ? 'Bacalaureat' : /olimpiad/i.test(course) ? 'Olimpiadă' : /evaluare/i.test(course) ? 'Evaluare Națională' : null
    const summary = [
      intent || 'Lecție de probă',
      course && `Curs: ${course}`,
      format && `Format: ${format}`,
      place && (place === 'online' ? 'Online' : 'La sediu'),
    ].filter(Boolean).join(' · ')

    const lead = await prisma.lead.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        message: message || `Formular de pe site — ${summary}`,
        source: 'SITE',
        sourceDetail: 'pischool.md',
        status: 'LEAD',
        isAdult: /adul/i.test(course),
        interestedIn,
        lessonType,
        locationType: place,
      }
    })

    // Notificarea nu trebuie să strice trimiterea: lead-ul e deja salvat
    await notifyNewLead(lead).catch((e) => console.error('Notificare lead nou:', e?.message))

    return NextResponse.json({ success: true, id: lead.id })
  } catch (error) {
    console.error('Eroare la salvarea mesajului:', error)
    return NextResponse.json(
      { error: 'A apărut o eroare la procesarea cererii' },
      { status: 500 }
    )
  }
}

// Fără GET public: lista de lead-uri conține date personale și se citește
// exclusiv autentificat, prin /api/admin/leads.
