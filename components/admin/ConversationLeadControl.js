'use client'

import { useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { statusOptionsFor, getStatus } from '@/lib/leads-config'

/**
 * Statusul lead-ului, chiar din conversație.
 *
 * Dacă persoana e deja lead, îi schimbi statusul fără să pleci din chat.
 * Dacă nu, o faci lead dintr-un clic — cu numele, sursa și legătura spre
 * conversație, ca s-o regăsești de oriunde.
 */
export default function ConversationLeadControl({ conversation, onChange }) {
  const [saving, setSaving] = useState(false)
  const lead = conversation.lead

  const changeStatus = async (status) => {
    const previous = lead.status
    onChange({ ...lead, status })       // se vede imediat
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Statusul nu s-a putut schimba')
      const st = getStatus(status)
      toast.success(`${st.emoji} ${st.label}`)
    } catch (err) {
      onChange({ ...lead, status: previous })  // înapoi, dacă n-a mers
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const createLead = async () => {
    setSaving(true)
    try {
      const isIg = conversation.platform === 'instagram'
      const res = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: conversation.person?.name || 'Contact fără nume',
          source: isIg ? 'INSTAGRAM' : 'MESSENGER',
          sourceDetail: conversation.person?.username
            ? `@${conversation.person.username}`
            : (isIg ? 'Instagram' : 'Messenger'),
          message: conversation.snippet || null,
          status: 'CONTACTAT',
          metaConversationId: conversation.id,
          metaPlatform: conversation.platform,
          metaPersonId: conversation.person?.id || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Lead-ul nu s-a putut crea')

      const created = json.lead || json
      onChange({ id: created.id, status: created.status || 'CONTACTAT', name: created.name })
      toast.success('Adăugat în lead-uri')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!lead) {
    return (
      <button
        type="button"
        onClick={createLead}
        disabled={saving}
        className="px-2.5 py-1.5 rounded-lg border border-dashed border-indigo-300 text-indigo-700 text-xs font-medium hover:bg-indigo-50 disabled:opacity-60 whitespace-nowrap"
      >
        {saving ? '…' : '+ Adaugă ca lead'}
      </button>
    )
  }

  const st = getStatus(lead.status)

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={lead.status}
        onChange={(e) => changeStatus(e.target.value)}
        disabled={saving}
        title="Statusul lead-ului"
        className={`pl-2 pr-7 py-1.5 rounded-lg border text-xs font-medium focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 ${st.color}`}
      >
        {statusOptionsFor(lead.status).map((s) => (
          <option key={s.value} value={s.value}>{s.emoji} {s.label}</option>
        ))}
      </select>
      <Link
        href={`/admin/leads/${lead.id}`}
        target="_blank"
        className="text-[11px] text-gray-400 hover:text-indigo-600 whitespace-nowrap"
        title="Deschide fișa lead-ului"
      >
        fișa ↗
      </Link>
    </div>
  )
}
