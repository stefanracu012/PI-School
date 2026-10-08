'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline'

/**
 * Buton care copiază datele elevilor dintr-o grupă în clipboard.
 *
 * @param {Array} students - listă de obiecte cu forma:
 *   {
 *     fullName, parentName, parentEmail, parentPhone,
 *     lastPaymentAmount (number|null), lastPaymentDate (string|null)
 *   }
 * @param {string} groupName - numele grupei (folosit pentru header)
 * @param {string} className - clase Tailwind extra (opțional)
 * @param {string} variant - 'admin' (indigo) sau 'teacher' (teal)
 */
export default function CopyStudentsButton({ students = [], groupName = '', className = '', variant = 'admin' }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!students.length) {
      toast.error('Nu sunt elevi de copiat')
      return
    }

    const fmtDate = (d) => {
      if (!d) return ''
      try {
        return new Date(d).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' })
      } catch { return '' }
    }
    const fmtAmount = (a) => (a == null ? '—' : `${Number(a).toLocaleString('ro-RO')} lei`)

    const header = groupName ? `Elevi din grupa: ${groupName}\n${'='.repeat(40)}\n` : ''
    const lines = students.map((s, i) => {
      const parts = [
        `${i + 1}. ${s.fullName || '—'}`,
        `   Părinte: ${s.parentName || '—'}`,
        `   Telefon: ${s.parentPhone || '—'}`,
        `   Email:   ${s.parentEmail || '—'}`,
        `   Ultima plată: ${fmtAmount(s.lastPaymentAmount)}${s.lastPaymentDate ? ` (${fmtDate(s.lastPaymentDate)})` : ''}`,
      ]
      return parts.join('\n')
    })
    const text = header + lines.join('\n\n')

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      toast.success(`Date copiate (${students.length} ${students.length === 1 ? 'elev' : 'elevi'})`)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('Copy error:', e)
      toast.error('Nu s-au putut copia datele')
    }
  }

  const colors = variant === 'teacher'
    ? 'bg-teal-600 hover:bg-teal-700 text-white'
    : 'bg-indigo-600 hover:bg-indigo-700 text-white'

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs xs:text-sm font-medium transition-colors ${colors} ${className}`}
      title="Copiază numele, contactul părintelui și ultima plată pentru toți elevii"
    >
      {copied ? <CheckIcon className="w-4 h-4" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
      <span>{copied ? 'Copiat!' : 'Copie date'}</span>
    </button>
  )
}
