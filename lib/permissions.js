import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * Verifică dacă utilizatorul curent are o permisiune specifică
 * SUPERADMIN are automat toate permisiunile
 * @returns {{ allowed: boolean, user: object|null }}
 */
export async function checkPermission(permission) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user) {
    return { allowed: false, user: null }
  }

  // SUPERADMIN are toate permisiunile
  if (session.user.role === 'SUPERADMIN') {
    return { allowed: true, user: session.user }
  }

  // ADMIN și TEACHER pot avea permisiuni punctuale, verificate la fel
  if (['ADMIN', 'TEACHER'].includes(session.user.role)) {
    // Verificăm mai întâi din sesiune (mai rapid)
    if (session.user.permissions?.includes(permission)) {
      return { allowed: true, user: session.user }
    }
    
    // Fallback la baza de date
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { permissions: true }
    })
    
    return { 
      allowed: user?.permissions?.includes(permission) || false, 
      user: session.user 
    }
  }

  return { allowed: false, user: session.user }
}

/**
 * Verifică dacă utilizatorul curent are cel puțin una din permisiuni
 * @returns {{ allowed: boolean, user: object|null }}
 */
export async function checkAnyPermission(permissions) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user) {
    return { allowed: false, user: null }
  }

  if (session.user.role === 'SUPERADMIN') {
    return { allowed: true, user: session.user }
  }

  if (['ADMIN', 'TEACHER'].includes(session.user.role)) {
    // Verificăm mai întâi din sesiune
    if (permissions.some(p => session.user.permissions?.includes(p))) {
      return { allowed: true, user: session.user }
    }
    
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { permissions: true }
    })
    
    return { 
      allowed: permissions.some(p => user?.permissions?.includes(p)),
      user: session.user
    }
  }

  return { allowed: false, user: session.user }
}

/**
 * Verifică dacă utilizatorul curent are toate permisiunile
 */
export async function checkAllPermissions(permissions) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user) {
    return false
  }

  if (session.user.role === 'SUPERADMIN') {
    return true
  }

  if (session.user.role === 'ADMIN') {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { permissions: true }
    })
    
    return permissions.every(p => user?.permissions?.includes(p))
  }

  return false
}

/**
 * Returnează permisiunile utilizatorului curent
 */
export async function getUserPermissions() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user) {
    return []
  }

  if (session.user.role === 'SUPERADMIN') {
    return ['*'] // All permissions
  }

  if (session.user.role === 'ADMIN') {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { permissions: true }
    })
    
    return user?.permissions || []
  }

  return []
}

/**
 * Middleware pentru a verifica permisiunea și a returna eroare dacă nu există
 */
export async function requirePermission(permission) {
  const hasPermission = await checkPermission(permission)
  
  if (!hasPermission) {
    throw new Error('Forbidden: Nu ai permisiunea necesară pentru această acțiune')
  }
  
  return true
}

/**
 * Middleware pentru a verifica cel puțin o permisiune
 */
export async function requireAnyPermission(permissions) {
  const hasPermission = await checkAnyPermission(permissions)
  
  if (!hasPermission) {
    throw new Error('Forbidden: Nu ai permisiunile necesare pentru această acțiune')
  }
  
  return true
}
