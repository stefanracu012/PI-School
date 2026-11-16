'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { EyeIcon, EyeSlashIcon, KeyIcon } from '@heroicons/react/24/outline'

/**
 * Schimbarea parolei de către utilizatorul curent (admin sau profesor).
 * Parola nouă poate fi orice, minim 6 caractere. Se cere și parola curentă.
 */

const MIN_LENGTH = 6

function PasswordField({ label, value, onChange, autoComplete, hint }) {
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeSlashIcon : EyeIcon

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? 'Ascunde parola' : 'Arată parola'}
          className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-600"
        >
          <Icon className="h-4 w-4" />
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

export default function ChangePassword() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  const mismatch = confirm.length > 0 && next !== confirm
  const canSubmit = current && next.length >= MIN_LENGTH && next === confirm && !saving

  const submit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return

    setSaving(true)
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Nu am putut schimba parola')

      setCurrent('')
      setNext('')
      setConfirm('')
      toast.success('Parola a fost schimbată')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <KeyIcon className="h-5 w-5 text-indigo-600" />
        Schimbă parola
      </h2>
      <p className="text-sm text-gray-600 mt-1">
        Alege orice parolă vrei, de minim {MIN_LENGTH} caractere. Dacă ai uitat-o pe cea curentă,
        folosește „Am uitat parola&rdquo; din pagina de login.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-4 max-w-sm">
        <PasswordField
          label="Parola curentă"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />
        <PasswordField
          label="Parola nouă"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          hint={next && next.length < MIN_LENGTH ? `Încă ${MIN_LENGTH - next.length} caractere` : null}
        />
        <PasswordField
          label="Repetă parola nouă"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          hint={mismatch ? 'Parolele nu coincid' : null}
        />

        <button
          type="submit"
          disabled={!canSubmit}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Se salvează…' : 'Salvează parola'}
        </button>
      </form>
    </div>
  )
}
