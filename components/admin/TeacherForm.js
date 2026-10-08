'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import TwoFactorModal from './TwoFactorModal'
import { PERMISSIONS, getPermissionsByCategory, PERMISSION_CATEGORIES } from '@/config/permissions'
import { ChevronDownIcon, ChevronUpIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'

export default function TeacherForm({ teacher }) {
  const router = useRouter()
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
  const [show2FA, setShow2FA] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState({})
  const [formData, setFormData] = useState({
    name: teacher?.name || '',
    email: teacher?.email || '',
    phone: teacher?.phone || '',
    telegramChatId: teacher?.telegramChatId || '',
    password: '',
    role: teacher?.role || 'TEACHER',
    active: teacher?.active ?? true,
    twoFactorAllowed: teacher?.twoFactorAllowed ?? false,
    superTeacher: teacher?.superTeacher ?? false,
    canViewAllSchedules: teacher?.canViewAllSchedules ?? false,
    permissions: teacher?.permissions || []
  })

  const isSuperAdmin = session?.user?.role === 'SUPERADMIN'
  const canChangeRole = isSuperAdmin

  // Adminul vede toate categoriile; profesorul, doar acțiunile lui.
  // Restul permisiunilor n-ar avea ce face într-un cont de profesor.
  const TEACHER_CATEGORY = 'Corectări'
  const isTeacherRole = formData.role === 'TEACHER'
  const showPermissions = isSuperAdmin && (formData.role === 'ADMIN' || isTeacherRole)
  const visibleCategories = isTeacherRole
    ? [TEACHER_CATEGORY]
    : PERMISSION_CATEGORIES

  const permissionsByCategory = useMemo(() => getPermissionsByCategory(), [])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleRoleChange = (e) => {
    const newRole = e.target.value
    setFormData(prev => ({
      ...prev,
      role: newRole,
      // Reset permissions when changing to TEACHER
      // La trecerea spre profesor rămân doar drepturile care au sens acolo
      permissions: newRole === 'TEACHER'
        ? prev.permissions.filter((k) => k.startsWith('teacher.'))
        : prev.permissions
    }))
  }

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }))
  }

  const handlePermissionChange = (permKey) => {
    setFormData(prev => {
      const newPermissions = prev.permissions.includes(permKey)
        ? prev.permissions.filter(p => p !== permKey)
        : [...prev.permissions, permKey]
      return { ...prev, permissions: newPermissions }
    })
  }

  const selectAllInCategory = (category) => {
    const categoryPerms = permissionsByCategory[category]?.map(p => p.key) || []
    setFormData(prev => {
      const hasAll = categoryPerms.every(p => prev.permissions.includes(p))
      if (hasAll) {
        // Deselect all
        return {
          ...prev,
          permissions: prev.permissions.filter(p => !categoryPerms.includes(p))
        }
      } else {
        // Select all
        const newPerms = [...new Set([...prev.permissions, ...categoryPerms])]
        return { ...prev, permissions: newPerms }
      }
    })
  }

  const selectAll = () => {
    // La profesor, „tot" înseamnă doar drepturile lui, nu toată aplicația
    const allPerms = isTeacherRole
      ? Object.keys(PERMISSIONS).filter((k) => k.startsWith('teacher.'))
      : Object.keys(PERMISSIONS)

    setFormData(prev => {
      const hasAll = allPerms.every((k) => prev.permissions.includes(k))
      return {
        ...prev,
        permissions: hasAll
          ? prev.permissions.filter((k) => !allPerms.includes(k))
          : [...new Set([...prev.permissions, ...allPerms])],
      }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Check if user has 2FA enabled
    if (session?.user?.twoFactorEnabled) {
      setShow2FA(true)
    } else {
      // No 2FA - execute directly
      executeSubmit(null)
    }
  }

  const executeSubmit = async (actionToken) => {
    setShow2FA(false)
    setLoading(true)

    try {
      const url = teacher ? `/api/admin/teachers/${teacher.id}` : '/api/admin/teachers'
      const method = teacher ? 'PUT' : 'POST'

      const payload = { ...formData }
      if (actionToken) {
        payload.actionToken = actionToken
      }
      if (teacher && !payload.password) {
        delete payload.password
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        toast.success(teacher ? 'Contul a fost actualizat' : 'Contul a fost creat')
        router.push('/admin/teachers')
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'A apărut o eroare')
      }
    } catch (error) {
      toast.error('A apărut o eroare')
    } finally {
      setLoading(false)
    }
  }

  const getRoleDescription = (role) => {
    switch(role) {
      case 'TEACHER': return 'Acces doar la portalul de profesor - vedere grupe proprii, prezențe, etc.'
      case 'ADMIN': return 'Acces la panoul admin cu permisiuni definite mai jos.'
      default: return ''
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nume</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            />
          </div>

          {/* Role selector - only for SUPERADMIN */}
          {canChangeRole && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleRoleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
              >
                <option value="TEACHER">Profesor</option>
                <option value="ADMIN">Administrator</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                {getRoleDescription(formData.role)}
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              name="email"
              autoComplete="off"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={!!teacher}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefon (opțional)</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
              placeholder="ex: 069123456"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telegram Chat ID (opțional)</label>
            <input
              type="text"
              name="telegramChatId"
              value={formData.telegramChatId}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
              placeholder="ex: 123456789"
            />
            <p className="mt-1 text-xs text-gray-500">
              ID-ul de chat pentru notificări Telegram (lecții zilnice, elevi noi)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {teacher ? 'Parolă nouă (opțional)' : 'Parolă *'}
            </label>
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              value={formData.password}
              onChange={handleChange}
              required={!teacher}
              minLength={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 placeholder-gray-700"
              placeholder={teacher ? 'Lasă gol pentru a păstra parola curentă' : 'Opțional - pentru login cu email/parolă'}
            />
          </div>

          <div className="flex items-center">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="active"
                checked={formData.active}
                onChange={handleChange}
                className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-gray-700">Cont activ</span>
            </label>
          </div>

          <div className="flex items-center">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="twoFactorAllowed"
                checked={formData.twoFactorAllowed}
                onChange={handleChange}
                className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Permite 2FA</span>
                <p className="text-xs text-gray-500">Utilizatorul va putea activa autentificarea în doi pași</p>
              </div>
            </label>
          </div>

          {formData.role === 'TEACHER' && (
            <div className="flex items-center md:col-span-2">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="canViewAllSchedules"
                  checked={formData.canViewAllSchedules}
                  onChange={handleChange}
                  className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">📅 Vede orarul întregii școli</span>
                  <p className="text-xs text-gray-500">
                    Fără bifă, în <strong>Orar</strong> își vede doar propriile grupe și recuperări.
                    Cu bifă, vede și grupele celorlalți profesori.
                  </p>
                </div>
              </label>
            </div>
          )}

          {formData.role === 'TEACHER' && (
            <div className="flex items-center md:col-span-2">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="superTeacher"
                  checked={formData.superTeacher}
                  onChange={handleChange}
                  className="w-5 h-5 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">⭐ Super Profesor</span>
                  <p className="text-xs text-gray-500">
                    Poate porni lecții la <strong>orice dată și oră</strong> (în trecut sau viitor), fără restricții de program. Util pentru înregistrare retroactivă.
                  </p>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Permissions Section - Only for ADMIN and only SUPERADMIN can edit */}
        {showPermissions && (
          <div className="border-t pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <ShieldCheckIcon className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Permisiuni</h3>
                  <p className="text-sm text-gray-500">
                    {isTeacherRole
                      ? 'Ce poate corecta singur, fără să ceară administrației'
                      : 'Selectează ce poate face acest administrator în sistem'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={selectAll}
                className="px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
              >
                {isTeacherRole
                  ? 'Selectează toate'
                  : formData.permissions.length === Object.keys(PERMISSIONS).length
                    ? 'Deselectează tot'
                    : 'Selectează tot'}
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                {isTeacherRole ? (
                  <>
                    <strong>Cum funcționează:</strong> fiecare drept merge <strong>24 de ore</strong> de la
                    crearea înregistrării — cât timp greșeala e proaspătă. Peste acest interval, doar cu
                    „Fără limita de 24 de ore". Administrația poate oricând orice.
                  </>
                ) : (
                  <>
                    <strong>Atenție:</strong> Dacă nu selectezi nicio permisiune, acest utilizator va avea acces
                    la panoul admin dar nu va putea vedea sau face nimic.
                  </>
                )}
              </p>
            </div>

            <div className="space-y-2">
              {visibleCategories.map(category => {
                const categoryPerms = permissionsByCategory[category] || []
                if (categoryPerms.length === 0) return null

                const selectedCount = categoryPerms.filter(p => formData.permissions.includes(p.key)).length
                const isExpanded = expandedCategories[category]
                const allSelected = selectedCount === categoryPerms.length

                return (
                  <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-900">{category}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          selectedCount === 0
                            ? 'bg-gray-200 text-gray-600'
                            : allSelected
                              ? 'bg-green-100 text-green-700'
                              : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {selectedCount}/{categoryPerms.length}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="p-4 border-t border-gray-200 space-y-3">
                        <button
                          type="button"
                          onClick={() => selectAllInCategory(category)}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          {allSelected ? 'Deselectează toate din categorie' : 'Selectează toate din categorie'}
                        </button>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {categoryPerms.map(perm => (
                            <label
                              key={perm.key}
                              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                formData.permissions.includes(perm.key)
                                  ? 'bg-indigo-50 border-indigo-300'
                                  : 'bg-white border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={formData.permissions.includes(perm.key)}
                                onChange={() => handlePermissionChange(perm.key)}
                                className="mt-0.5 w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                              />
                              <div className="min-w-0 flex-1">
                                <span className="text-sm font-medium text-gray-900 block">{perm.label}</span>
                                <span className="text-xs text-gray-500">{perm.description}</span>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {formData.permissions.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Permisiuni selectate ({formData.permissions.length}):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {formData.permissions.map(perm => (
                    <span key={perm} className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full">
                      {PERMISSIONS[perm]?.label || perm}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-4 pt-4 border-t">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
          >
            Anulează
          </button>
          <button
            type="submit"
            disabled={loading}
            className={`px-6 py-2 text-white rounded-lg font-medium disabled:opacity-50 ${
              formData.role === 'ADMIN'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {loading ? 'Se salvează...' : (teacher ? 'Actualizează' : `Creează ${
              formData.role === 'ADMIN' ? 'administrator' : 'profesor'
            }`)}
          </button>
        </div>
      </form>

      <TwoFactorModal
        isOpen={show2FA}
        onClose={() => setShow2FA(false)}
        onVerify={executeSubmit}
        title="Verificare 2FA"
        description={teacher ? 'Confirmă identitatea pentru a actualiza contul.' : 'Confirmă identitatea pentru a crea contul.'}
      />
    </>
  )
}
