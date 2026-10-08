// Paginile CRM-ului. Tot restul e site-ul public al școlii (pischool.md),
// care are culorile lui și nu primește tema deschisă/întunecată a CRM-ului.
export const CRM_PATH = /^\/(admin|teacher|login)(\/|$)/

export const isCrmPath = (pathname) => CRM_PATH.test(pathname || '')
