import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { createSiteLead } from '@/lib/site-leads'

/**
 * Înscrierea la un curs anume (pagina /curs/[slug]). Devine lead în CRM,
 * cu sursa SITE și cursul în mesaj.
 */
export async function POST(request) {
  try {
    // Rate limiting: 2 requests per minute
    const clientIP = getClientIP(request)
    const rateLimitKey = `enrollments:${clientIP}`
    const { success, resetIn } = checkRateLimit(rateLimitKey, 2, 60000)

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

    const body = await request.json()

    const { courseId, studentName, studentAge, parentName, parentPhone, parentEmail, city, observations } = body

    // Validation
    if (!courseId || !studentName || !parentName || !parentPhone || !parentEmail) {
      return NextResponse.json(
        { error: 'Câmpurile obligatorii lipsesc' },
        { status: 400 }
      )
    }

    // Check if course exists
    const course = /^[a-f0-9]{24}$/i.test(String(courseId))
      ? await prisma.course.findUnique({ where: { id: courseId } })
      : null

    if (!course) {
      return NextResponse.json(
        { error: 'Cursul nu a fost găsit' },
        { status: 404 }
      )
    }

    const message = [
      `Înscriere de pe site la cursul „${course.title}"`,
      city && `Oraș: ${city}`,
      observations && `Observații: ${observations}`,
    ].filter(Boolean).join('\n')

    const lead = await createSiteLead({
      name: String(parentName).trim().slice(0, 120),
      phone: String(parentPhone).trim().slice(0, 40),
      email: String(parentEmail).trim().slice(0, 160),
      message: message.slice(0, 2000),
      sourceDetail: `pischool.md/curs/${course.slug}`,
      child: { name: String(studentName).trim().slice(0, 120), age: studentAge },
    })

    return NextResponse.json({ success: true, id: lead.id }, { status: 201 })
  } catch (error) {
    console.error('Error creating enrollment:', error)
    return NextResponse.json(
      { error: 'A apărut o eroare la trimiterea înscrierii' },
      { status: 500 }
    )
  }
}
