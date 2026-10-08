'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeftIcon, EnvelopeIcon, PhoneIcon, UserIcon, CalendarIcon,
  ChatBubbleLeftIcon, TrashIcon, PlusIcon, PencilSquareIcon, BellAlertIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { usePermissions } from '@/hooks/usePermissions'
import { whatsAppLink } from '@/lib/phone'
import FollowUpPicker from '@/components/admin/FollowUpPicker'
import { statusOptionsFor, getStatus, getSource } from '@/lib/leads-config'
import LeadForm from '@/components/admin/LeadForm'
import { childrenOf } from '@/lib/lead-children'
import { preferenceLabel } from '@/lib/lesson-preferences'

const ageText = (age, isAdult) => (isAdult ? 'Adult' : age ? `${age} ani` : null)

export default function LeadDetailClient({ lead: initial, staff = [] }) {
  const router = useRouter()
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission('leads.edit')
  const canDelete = hasPermission('leads.delete')

  const [lead, setLead] = useState(initial)
  const [notes, setNotes] = useState(initial.leadNotes || [])
  const [newNote, setNewNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingNote, setSavingNote] = useState(false)

  const status = getStatus(lead.status)
  const source = getSource(lead.source)
  const sourceLink = source.link(lead)
  const kids = childrenOf(lead)
  const assignedName = lead.assignedToId
    ? (() => {
        const u = staff.find((s) => s.id === lead.assignedToId)
        return u ? (u.name || u.email) : null
      })()
    : null

  const patch = async (payload, successMsg) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eroare la actualizare')
      setLead({ ...lead, ...data })
      toast.success(successMsg)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const addNote = async () => {
    if (!newNote.trim()) return
    setSavingNote(true)
    try {
      const res = await fetch('/api/admin/lead-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, content: newNote.trim() }),
      })
      const note = await res.json()
      if (!res.ok) throw new Error(note.error || 'Eroare la adăugare')
      setNotes([note, ...notes])
      setNewNote('')
      toast.success('Notiță adăugată')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingNote(false)
    }
  }

  const deleteNote = async (id) => {
    if (!confirm('Ștergi această notiță?')) return
    try {
      const res = await fetch(`/api/admin/lead-notes/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Eroare la ștergere')
      setNotes(notes.filter((n) => n.id !== id))
      toast.success('Notiță ștearsă')
    } catch (e) {
      toast.error(e.message)
    }
  }

  const deleteLead = async () => {
    if (!confirm(`Ștergi definitiv lead-ul „${lead.name}"? Notițele se șterg odată cu el.`)) return
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Eroare la ștergere')
      toast.success('Lead șters')
      router.push('/admin/leads')
      router.refresh()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const waLink = whatsAppLink(lead.phone)

  if (editing) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(false)} className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Editează lead</h1>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 xs:p-6">
          <LeadForm
            lead={lead}
            staff={staff}
            onSaved={(updated) => {
              setLead({ ...lead, ...updated })
              setEditing(false)
              router.refresh()
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 xs:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/admin/leads" className="p-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
            <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl xs:text-2xl font-bold text-gray-900 truncate">{lead.name}</h1>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${source.color}`}>
                {source.emoji} {source.label}
              </span>
              <span className="text-xs text-gray-500">
                adăugat {new Date(lead.createdAt).toLocaleDateString('ro-RO')}
                {lead.createdBy?.name ? ` de ${lead.createdBy.name}` : ''}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              title="Editează"
            >
              <PencilSquareIcon className="h-5 w-5" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={deleteLead}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Șterge"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 xs:gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Contact */}
          <div className="bg-white rounded-xl p-4 xs:p-6 border border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <UserIcon className="h-5 w-5 text-indigo-600" />
              Date de contact
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Persoana de contact" value={lead.name} />
              {lead.phone && (
                <Field label="Telefon">
                  <a href={`tel:${lead.phone}`} className="font-medium text-indigo-600 hover:underline flex items-center gap-1">
                    <PhoneIcon className="h-4 w-4" />{lead.phone}
                  </a>
                </Field>
              )}
              {lead.email && (
                <Field label="Email">
                  <a href={`mailto:${lead.email}`} className="font-medium text-indigo-600 hover:underline flex items-center gap-1 break-all">
                    <EnvelopeIcon className="h-4 w-4 shrink-0" />{lead.email}
                  </a>
                </Field>
              )}
              {lead.sourceDetail && <Field label={source.detailLabel} value={lead.sourceDetail} />}
              {kids.length > 0 ? (
                <Field label={kids.length > 1 ? `Elevi (${kids.length})` : 'Elev'}>
                  <div className="space-y-0.5">
                    {kids.map((c, i) => (
                      <p key={i} className="font-medium text-gray-900">
                        {[c.name, ageText(c.age, c.isAdult), c.level, preferenceLabel(c)].filter(Boolean).join(' · ')}
                      </p>
                    ))}
                  </div>
                </Field>
              ) : (
                <>
                  {ageText(lead.studentAge, lead.isAdult) && (
                    <Field label="Vârstă" value={ageText(lead.studentAge, lead.isAdult)} />
                  )}
                  {lead.interestedIn && <Field label="Nivel actual" value={lead.interestedIn} />}
                  {preferenceLabel(lead) && <Field label="Preferă" value={preferenceLabel(lead)} />}
                </>
              )}
              {assignedName && <Field label="Responsabil" value={assignedName} />}
            </div>
          </div>

          {/* Mesaj */}
          {lead.message && (
            <div className="bg-white rounded-xl p-4 xs:p-6 border border-gray-200">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <ChatBubbleLeftIcon className="h-5 w-5 text-indigo-600" />
                Mesaj / context
              </h2>
              <p className="text-gray-700 whitespace-pre-wrap">{lead.message}</p>
            </div>
          )}

          {/* Acțiuni rapide */}
          <div className="bg-white rounded-xl p-4 xs:p-6 border border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-3">Acțiuni rapide</h2>
            <div className="flex flex-wrap gap-2">
              {lead.phone && (
                <>
                  <a href={`tel:${lead.phone}`} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
                    📞 Sună
                  </a>
                  <a href={waLink} target="_blank" rel="noopener noreferrer"
                     className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
                    🟢 WhatsApp
                  </a>
                </>
              )}
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                  ✉️ Email
                </a>
              )}
              {sourceLink && !sourceLink.startsWith('tel:') && (
                <a href={sourceLink} target="_blank" rel="noopener noreferrer"
                   className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors inline-flex items-center gap-1">
                  {source.emoji} Deschide {source.label}
                  <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* Notițe */}
          <div className="bg-white rounded-xl p-4 xs:p-6 border border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-3">Istoric notițe</h2>
            {canEdit && (
              <div className="mb-4">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Ce ați discutat? Ce urmează?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-gray-700 text-sm"
                  rows={3}
                />
                <button
                  onClick={addNote}
                  disabled={savingNote || !newNote.trim()}
                  className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                >
                  <PlusIcon className="h-4 w-4" />
                  {savingNote ? 'Se adaugă…' : 'Adaugă notiță'}
                </button>
              </div>
            )}

            {notes.length > 0 ? (
              <div className="space-y-3">
                {notes.map((note) => (
                  <div key={note.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap flex-1">{note.content}</p>
                      {canEdit && (
                        <button onClick={() => deleteNote(note.id)} className="p-1 text-red-500 hover:bg-red-50 rounded shrink-0">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      {note.authorName ? `${note.authorName} · ` : ''}
                      {new Date(note.createdAt).toLocaleDateString('ro-RO', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">Nicio notiță încă</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-4 xs:p-6 border border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-3">Status</h2>
            <select
              value={lead.status}
              onChange={(e) => patch({ status: e.target.value }, 'Status actualizat')}
              disabled={saving || !canEdit}
              className={`w-full px-4 py-3 rounded-lg border-2 text-sm font-medium cursor-pointer focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 ${status.color}`}
            >
              {statusOptionsFor(lead.status).map((o) => (
                <option key={o.value} value={o.value}>{o.emoji} {o.label}</option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-xl p-4 xs:p-6 border border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <BellAlertIcon className="h-5 w-5 text-indigo-600" />
              Recontactare
            </h2>
            {/* Același selector ca în listă: dată + oră + minut, în ora Chișinăului */}
            <FollowUpPicker
              value={lead.nextFollowUpAt}
              disabled={saving || !canEdit}
              onChange={(iso) => patch(
                { nextFollowUpAt: iso },
                iso ? 'Follow-up actualizat' : 'Follow-up eliminat'
              )}
            />
          </div>

          <div className="bg-white rounded-xl p-4 xs:p-6 border border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-2">Adăugat</h2>
            <p className="text-gray-600 text-sm flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              {new Date(lead.createdAt).toLocaleDateString('ro-RO', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, children }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      {children || <p className="font-medium text-gray-900">{value}</p>}
    </div>
  )
}
