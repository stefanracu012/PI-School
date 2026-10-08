import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { requireAdmin } from '@/lib/session'

export async function POST(request) {
  try {
    await requireAdmin()
    
    const formData = await request.formData()
    const file = formData.get('file')
    const folder = formData.get('folder') || 'uploads'
    
    if (!file) {
      return NextResponse.json({ error: 'Nu a fost selectat niciun fișier' }, { status: 400 })
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Tipul fișierului nu este permis. Folosește JPG, PNG, WebP, GIF sau AVIF.' }, { status: 400 })
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'Fișierul este prea mare. Maxim 5MB.' }, { status: 400 })
    }

    // Check if BLOB token is configured
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('BLOB_READ_WRITE_TOKEN is not configured')
      return NextResponse.json({ error: 'Serviciul de stocare nu este configurat. Adaugă BLOB_READ_WRITE_TOKEN în variabilele de mediu.' }, { status: 500 })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const ext = file.name.split('.').pop()
    const filename = `${folder}/${timestamp}.${ext}`
    
    // Upload to Vercel Blob
    const blob = await put(filename, file, {
      access: 'public',
    })
    
    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error('Upload error:', error)
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    // Check for Vercel Blob specific errors
    if (error.message?.includes('BLOB') || error.message?.includes('token')) {
      return NextResponse.json({ error: 'Eroare la serviciul de stocare. Verifică configurația BLOB_READ_WRITE_TOKEN.' }, { status: 500 })
    }
    return NextResponse.json({ error: 'Eroare la încărcarea fișierului: ' + error.message }, { status: 500 })
  }
}
