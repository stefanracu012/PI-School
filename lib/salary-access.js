/**
 * Cine ce poate face cu salariile. Fără acces la bază, ca să poată fi
 * folosit și în formularele din browser.
 */

export const SALARY_PERMS = {
  view: 'salaries.view',      // admin: toți profesorii și istoricul
  edit: 'salaries.edit',      // admin: bonus, corectare, salariu scos, plata pe grupe
  delete: 'salaries.delete',  // admin: anulează o sumă
  own: 'teacher.salary.view', // profesor: își vede salariul și primește mesajele
}

/**
 * Superadminul poate tot. Cine poate edita sau anula vede automat și lista —
 * altfel n-ar ajunge la ce editează.
 */
export function salaryAccess(user) {
  if (!user) return { view: false, edit: false, delete: false, own: false }
  if (user.role === 'SUPERADMIN') return { view: true, edit: true, delete: true, own: true }
  const perms = user.permissions || []
  const isAdmin = user.role === 'ADMIN'
  const edit = isAdmin && perms.includes(SALARY_PERMS.edit)
  const del = isAdmin && perms.includes(SALARY_PERMS.delete)
  const view = isAdmin && (perms.includes(SALARY_PERMS.view) || edit || del)
  return { view, edit, delete: del, own: view || perms.includes(SALARY_PERMS.own) }
}
