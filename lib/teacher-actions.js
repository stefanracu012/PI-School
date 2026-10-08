import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPermission } from '@/lib/permissions'

/**
 * Ce poate corecta un profesor după ce a greșit — și cât timp.
 *
 * Regula: 24 de ore de la crearea înregistrării. Atât ține „greșeala
 * proaspătă": după o zi, cifrele au ajuns deja în rapoarte și în discuțiile cu
 * părinții, așa că o schimbare trebuie să treacă pe la administrație.
 *
 * Excepție: permisiunea `teacher.noTimeLimit`, pentru cine are nevoie să
 * repare și lucruri vechi.
 */

export const ACTION_WINDOW_HOURS = 24

export function hoursSince(date) {
  if (!date) return Infinity
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60)
}

export const withinWindow = (createdAt, hours = ACTION_WINDOW_HOURS) =>
  hoursSince(createdAt) < hours

/**
 * Are voie utilizatorul curent să facă acțiunea pe o înregistrare creată atunci?
 *
 * Administrația trece mereu. Profesorul are nevoie de permisiunea acțiunii și,
 * în plus, ori să fie în fereastra de 24h, ori să aibă dreptul fără limită.
 *
 * @returns {{ allowed: boolean, reason?: string, user?: object }}
 */
export async function canTeacherAct(permission, createdAt) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { allowed: false, reason: 'Neautentificat' }

  const user = session.user

  // Superadminul nu trece prin nicio regulă de aici
  if (user.role === 'SUPERADMIN') return { allowed: true, user }

  const { allowed } = await checkPermission(permission)
  if (!allowed) {
    return { allowed: false, reason: 'Nu ai permisiunea pentru această acțiune', user }
  }

  // Adminul are nevoie de drept, dar nu și de fereastra de timp: el repară
  // tocmai lucrurile vechi, pe care profesorul nu le mai poate atinge.
  if (user.role === 'ADMIN') return { allowed: true, user }

  if (withinWindow(createdAt)) return { allowed: true, user }

  const { allowed: unlimited } = await checkPermission('teacher.noTimeLimit')
  if (unlimited) return { allowed: true, user }

  return {
    allowed: false,
    user,
    reason: `Au trecut peste ${ACTION_WINDOW_HOURS} de ore de la creare. ` +
      'Cere-i unui administrator să facă schimbarea.',
  }
}

/** Împachetat pentru rute: ori merge mai departe, ori întoarce răspunsul de refuz. */
export async function guardTeacherAction(NextResponse, permission, createdAt) {
  const result = await canTeacherAct(permission, createdAt)
  if (result.allowed) return null
  return NextResponse.json(
    { error: result.reason || 'Acțiune nepermisă' },
    { status: result.reason === 'Neautentificat' ? 401 : 403 }
  )
}
