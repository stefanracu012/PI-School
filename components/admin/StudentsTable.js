'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import DeleteStudentButton from './DeleteStudentButton'
import { PermissionGate } from '@/hooks/usePermissions'

export default function StudentsTable({ students, groups }) {
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      // Search filter
      const searchLower = search.toLowerCase()
      const matchesSearch = !search || 
        student.fullName.toLowerCase().includes(searchLower) ||
        (student.parentName && student.parentName.toLowerCase().includes(searchLower)) ||
        (student.parentPhone && student.parentPhone.includes(search)) ||
        (student.parentEmail && student.parentEmail.toLowerCase().includes(searchLower))

      // Group filter
      const studentGroupIds = student.groupStudents.map(gs => gs.group.id)
      const matchesGroup = !groupFilter || studentGroupIds.includes(groupFilter)

      // Status filter (has groups or not)
      let matchesStatus = true
      if (statusFilter === 'with-groups') {
        matchesStatus = student.groupStudents.length > 0
      } else if (statusFilter === 'without-groups') {
        matchesStatus = student.groupStudents.length === 0
      }

      return matchesSearch && matchesGroup && matchesStatus
    })
  }, [students, search, groupFilter, statusFilter])

  const clearFilters = () => {
    setSearch('')
    setGroupFilter('')
    setStatusFilter('')
  }

  const hasActiveFilters = search || groupFilter || statusFilter

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-3 xs:p-4">
        <div className="flex flex-col gap-3">
          {/* Search */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Caută după nume, părinte, telefon sau email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 xs:px-4 py-2 text-sm xs:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 placeholder-gray-500"
              />
            </div>
          </div>

          {/* Filter Row */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Group Filter */}
            <div className="flex-1 sm:max-w-xs">
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm xs:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 bg-white"
              >
                <option value="">Toate grupele</option>
                {groups.map(group => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.level || 'Fără nivel'})
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex-1 sm:max-w-xs">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm xs:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 bg-white"
              >
                <option value="">Toți elevii</option>
                <option value="with-groups">Cu grupe asignate</option>
                <option value="without-groups">Fără grupe</option>
              </select>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Șterge filtrele
              </button>
            )}
          </div>
        </div>

        {/* Results count */}
        <div className="mt-3 text-sm text-gray-500">
          {filteredStudents.length} din {students.length} elevi
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Elev</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vârstă</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Părinte</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grupe</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acțiuni</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  {hasActiveFilters ? 'Nu s-au găsit elevi cu filtrele selectate' : 'Nu există elevi. Adaugă primul elev!'}
                </td>
              </tr>
            ) : (
              filteredStudents.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link
                      href={`/admin/students/${student.id}`}
                      className="font-medium text-gray-900 hover:text-indigo-600"
                    >
                      {student.fullName}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {student.age ? `${student.age} ani` : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {student.parentName || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm text-gray-900">{student.parentPhone || '-'}</p>
                      <p className="text-xs text-gray-500">{student.parentEmail || '-'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {student.groupStudents.length > 0 ? (
                        student.groupStudents.map((gs) => (
                          <span key={gs.id} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-800">
                            {gs.group.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-gray-500">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/admin/students/${student.id}`}
                        className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                      >
                        Detalii
                      </Link>
                      <PermissionGate permission="students.edit">
                        <Link
                          href={`/admin/students/${student.id}/edit`}
                          className="text-gray-600 hover:text-gray-900 text-sm font-medium"
                        >
                          Editează
                        </Link>
                      </PermissionGate>
                      <PermissionGate permission="students.delete">
                        <DeleteStudentButton id={student.id} name={student.fullName} />
                      </PermissionGate>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-3 xs:space-y-4">
        {filteredStudents.length === 0 ? (
          <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-8 xs:p-12 text-center text-gray-500 text-sm xs:text-base">
            {hasActiveFilters ? 'Nu s-au găsit elevi cu filtrele selectate' : 'Nu există elevi. Adaugă primul elev!'}
          </div>
        ) : (
          filteredStudents.map((student) => (
            <div key={student.id} className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-3 xs:p-4 space-y-3">
              {/* Student Name */}
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/admin/students/${student.id}`}
                  className="font-semibold text-gray-900 hover:text-indigo-600 text-sm xs:text-base"
                >
                  {student.fullName}
                </Link>
                {student.age && (
                  <span className="text-xs xs:text-sm text-gray-600 whitespace-nowrap">
                    {student.age} ani
                  </span>
                )}
              </div>

              {/* Parent Info */}
              <div className="space-y-1.5">
                {student.parentName && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 min-w-[60px] xs:min-w-[70px]">Părinte:</span>
                    <span className="text-xs xs:text-sm text-gray-900 flex-1">{student.parentName}</span>
                  </div>
                )}
                {student.parentPhone && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 min-w-[60px] xs:min-w-[70px]">Telefon:</span>
                    <span className="text-xs xs:text-sm text-gray-900 flex-1">{student.parentPhone}</span>
                  </div>
                )}
                {student.parentEmail && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 min-w-[60px] xs:min-w-[70px]">Email:</span>
                    <span className="text-xs xs:text-sm text-gray-900 flex-1 break-all">{student.parentEmail}</span>
                  </div>
                )}
              </div>

              {/* Groups */}
              {student.groupStudents.length > 0 && (
                <div>
                  <span className="text-xs text-gray-500 block mb-1.5">Grupe:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {student.groupStudents.map((gs) => (
                      <span key={gs.id} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-800">
                        {gs.group.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Link
                  href={`/admin/students/${student.id}`}
                  className="flex-1 px-3 xs:px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm xs:text-base font-medium hover:bg-indigo-700 transition-colors text-center"
                >
                  Detalii
                </Link>
                <PermissionGate permission="students.edit">
                  <Link
                    href={`/admin/students/${student.id}/edit`}
                    className="px-3 xs:px-4 py-2 bg-gray-200 text-gray-800 rounded-lg text-sm xs:text-base font-medium hover:bg-gray-300 transition-colors"
                  >
                    Editează
                  </Link>
                </PermissionGate>
                <PermissionGate permission="students.delete">
                  <DeleteStudentButton 
                    id={student.id} 
                    name={student.fullName} 
                    className="px-3 xs:px-4 py-2 bg-red-600 text-white rounded-lg text-sm xs:text-base font-medium hover:bg-red-700 transition-colors"
                  />
                </PermissionGate>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
