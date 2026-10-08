'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import TwoFactorModal from './TwoFactorModal'
import LevelSelect from '@/components/LevelSelect'

const days = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică']

// Parse scheduleTime - poate fi string simplu "18:00" sau JSON {"Luni":"16:00","Miercuri":"18:00"}
const parseScheduleTime = (scheduleTime, scheduleDays) => {
  if (!scheduleTime) return {}
  try {
    const parsed = JSON.parse(scheduleTime)
    if (typeof parsed === 'object') return parsed
  } catch {
    // E string simplu - aplicăm aceeași oră pentru toate zilele
    if (scheduleDays && scheduleDays.length > 0) {
      const times = {}
      scheduleDays.forEach(day => { times[day] = scheduleTime })
      return times
    }
  }
  return {}
}

export default function GroupForm({ group, teachers, branches = [] }) {
  const router = useRouter()
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
  const [show2FA, setShow2FA] = useState(false)
  const [branchSchedule, setBranchSchedule] = useState([])
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  // Plata profesorului o vede și o schimbă doar cine se ocupă de salarii
  const canSetSalary =
    session?.user?.role === 'SUPERADMIN' || (session?.user?.permissions || []).includes('salaries.manage')
  const [formData, setFormData] = useState({
    name: group?.name || '',
    level: group?.level || '',
    teacherId: group?.teacherId || '',
    branchId: group?.branchId || '',
    scheduleDays: group?.scheduleDays || [],
    scheduleTimes: parseScheduleTime(group?.scheduleTime, group?.scheduleDays),
    locationType: group?.locationType || 'offline',
    locationDetails: group?.locationDetails || '',
    startDate: group?.startDate ? new Date(group.startDate).toISOString().split('T')[0] : '',
    monthlyLessons: group?.monthlyLessons ?? 8,
    billingType: group?.billingType || 'MONTHLY',
    notes: group?.notes || '',
    isTrial: group?.isTrial ?? false,
    trialDate: group?.trialDate
      ? new Date(group.trialDate).toISOString().slice(0, 10)
      : '',
    trialTime: group?.trialDate
      ? new Date(group.trialDate).toISOString().slice(11, 16)
      : '17:00',
    active: group?.active ?? true,
    salaryType: group?.salaryType || '',
    salaryAmount: group?.salaryAmount ?? '',
  })

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
    
    // Când se schimbă filiala, fetch orar
    if (name === 'branchId' && value) {
      fetchBranchSchedule(value)
    } else if (name === 'branchId' && !value) {
      setBranchSchedule([])
    }
  }
  
  // Fetch orarul filialei selectate
  const fetchBranchSchedule = async (branchId) => {
    setLoadingSchedule(true)
    try {
      const res = await fetch('/api/admin/groups')
      if (res.ok) {
        const data = await res.json()
        // Filtrez grupele active pentru filiala selectată
        const filteredGroups = (data.groups || []).filter(
          g => g.active && g.branchId === branchId && g.id !== group?.id
        )
        setBranchSchedule(filteredGroups)
      }
    } catch (error) {
      console.error('Error fetching branch schedule:', error)
    } finally {
      setLoadingSchedule(false)
    }
  }
  
  // La editare, încarcă orarul filialei dacă există
  useEffect(() => {
    if (group?.branchId) {
      fetchBranchSchedule(group.branchId)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  
  // Parse scheduleTime pentru a obține ora pentru o zi specifică
  const getTimeForDay = (scheduleTime, day) => {
    if (!scheduleTime) return null
    try {
      const parsed = JSON.parse(scheduleTime)
      if (typeof parsed === 'object') return parsed[day] || null
    } catch {
      return scheduleTime
    }
    return null
  }

  const handleDayToggle = (day) => {
    setFormData(prev => {
      const newDays = prev.scheduleDays.includes(day)
        ? prev.scheduleDays.filter(d => d !== day)
        : [...prev.scheduleDays, day]
      
      // Dacă adăugăm zi, setăm ora default 16:00
      const newTimes = { ...prev.scheduleTimes }
      if (!prev.scheduleDays.includes(day)) {
        newTimes[day] = '16:00'
      } else {
        delete newTimes[day]
      }
      
      return {
        ...prev,
        scheduleDays: newDays,
        scheduleTimes: newTimes
      }
    })
  }

  const handleTimeChange = (day, time) => {
    setFormData(prev => ({
      ...prev,
      scheduleTimes: {
        ...prev.scheduleTimes,
        [day]: time
      }
    }))
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
      const url = group ? `/api/admin/groups/${group.id}` : '/api/admin/groups'
      const method = group ? 'PUT' : 'POST'

      // Convertim scheduleTimes în JSON string
      const scheduleTime = Object.keys(formData.scheduleTimes).length > 0 
        ? JSON.stringify(formData.scheduleTimes)
        : null

      const payload = {
        name: formData.name,
        level: formData.level || null,
        teacherId: formData.teacherId,
        branchId: formData.branchId || null,
        scheduleDays: formData.scheduleDays,
        scheduleTime,
        locationType: formData.locationType,
        locationDetails: formData.locationDetails,
        startDate: formData.startDate ? new Date(formData.startDate).toISOString() : null,
        monthlyLessons: parseInt(formData.monthlyLessons, 10) || 8,
        billingType: formData.billingType,
        notes: formData.notes?.trim() || null,
        isTrial: formData.isTrial,
        // Proba are o singură dată; nu intră în orarul săptămânal
        trialDate: formData.isTrial && formData.trialDate
          ? `${formData.trialDate}T${formData.trialTime || '17:00'}`
          : null,
        active: formData.active,
        ...(canSetSalary
          ? { salaryType: formData.salaryType || null, salaryAmount: formData.salaryAmount }
          : {}),
      }
      if (actionToken) {
        payload.actionToken = actionToken
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        toast.success(group ? 'Grupa a fost actualizată' : 'Grupa a fost creată')
        router.push('/admin/groups')
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

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4 xs:space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 xs:gap-6">
          <div>
            <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">Nume grupă *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-3 xs:px-4 py-2 text-sm xs:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 placeholder-gray-700"
              placeholder="ex: Clasa 9 — Luni/Miercuri"
            />
          </div>

        <div className="sm:col-span-2">
          <label className="flex items-start gap-2 p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300">
            <input
              type="checkbox"
              name="isTrial"
              checked={formData.isTrial}
              onChange={handleChange}
              className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Lecție de probă</span>
              <span className="block text-xs text-gray-500">
                Se ține o singură dată, la data și ora alese — fără orar săptămânal și fără
                pachet lunar de lecții
              </span>
            </span>
          </label>
        </div>

        {!formData.isTrial && (
          <div className="md:col-span-2 space-y-2">
            <p className="text-xs xs:text-sm font-medium text-gray-700">Cum se plătește</p>
            <div className="grid xs:grid-cols-2 gap-2 xs:gap-3">
              {[
                {
                  value: 'MONTHLY',
                  title: 'Lunar',
                  desc: 'Grupa are un număr fix de lecții pe lună. Se achită lunar, indiferent de prezență.',
                },
                {
                  value: 'INDIVIDUAL',
                  title: 'Per lecție',
                  desc: 'Fiecare elev își cumpără lecțiile. La fiecare prezență i se scade una — poate fi și o grupă întreagă, nu doar un elev singur.',
                },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                    formData.billingType === opt.value
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="billingType"
                    value={opt.value}
                    checked={formData.billingType === opt.value}
                    onChange={handleChange}
                    className="mt-0.5 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{opt.title}</span>
                    <span className="block text-xs text-gray-500">{opt.desc}</span>
                  </span>
                </label>
              ))}
            </div>

            {formData.billingType === 'MONTHLY' && (
              <div className="xs:max-w-xs">
                <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">Lecții pe lună</label>
                <input
                  type="number"
                  name="monthlyLessons"
                  min={1}
                  max={60}
                  value={formData.monthlyLessons}
                  onChange={handleChange}
                  className="w-full px-3 xs:px-4 py-2 text-sm xs:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  O lună anume poate fi schimbată din pagina grupei.
                </p>
              </div>
            )}
          </div>
        )}

        {formData.isTrial && (
          <div className="md:col-span-2 grid xs:grid-cols-2 gap-3 p-3 border border-indigo-200 bg-indigo-50/40 rounded-lg">
            <div>
              <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">Data probei</label>
              <input
                type="date"
                name="trialDate"
                value={formData.trialDate}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">Ora probei</label>
              <input
                type="time"
                name="trialTime"
                step={300}
                value={formData.trialTime}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
              />
            </div>
          </div>
        )}

        {canSetSalary && (
          <div className="md:col-span-2 space-y-2">
            <p className="text-xs xs:text-sm font-medium text-gray-700">Plata profesorului pe lecție</p>
            <div className="grid xs:grid-cols-3 gap-2 xs:gap-3">
              {[
                { value: '', title: 'Nesetat', desc: 'Lecțiile nu se adaugă singure la salariu.' },
                { value: 'FIXED', title: 'Sumă fixă', desc: 'Aceeași sumă pentru fiecare lecție ținută.' },
                { value: 'PER_PRESENCE', title: 'Per prezență', desc: 'Suma × numărul elevilor prezenți la lecție.' },
              ].map((opt) => (
                <label
                  key={opt.value || 'none'}
                  className={`flex items-start gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                    formData.salaryType === opt.value
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="salaryType"
                    value={opt.value}
                    checked={formData.salaryType === opt.value}
                    onChange={handleChange}
                    className="mt-0.5 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{opt.title}</span>
                    <span className="block text-xs text-gray-500">{opt.desc}</span>
                  </span>
                </label>
              ))}
            </div>

            {formData.salaryType && (
              <div className="xs:max-w-xs">
                <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
                  {formData.salaryType === 'FIXED' ? 'Lei pe lecție' : 'Lei pe elev prezent'}
                </label>
                <input
                  type="number"
                  name="salaryAmount"
                  min={0}
                  step="any"
                  required
                  value={formData.salaryAmount}
                  onChange={handleChange}
                  className="w-full px-3 xs:px-4 py-2 text-sm xs:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Se adaugă la salariu când lecția e salvată. Schimbarea nu atinge lecțiile deja ținute.
                </p>
              </div>
            )}
          </div>
        )}

          <div>
            <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">Nivel</label>
            <LevelSelect
              name="level"
              value={formData.level}
              onChange={handleChange}
              className="w-full px-3 xs:px-4 py-2 text-sm xs:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            />
          </div>

          <div>
            <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">Profesor *</label>
            <select
              name="teacherId"
              value={formData.teacherId}
              onChange={handleChange}
              required
              className="w-full px-3 xs:px-4 py-2 text-sm xs:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            >
              <option value="">Selectează profesor</option>
              {teachers.map(teacher => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name || teacher.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">Filială</label>
            <select
              name="branchId"
              value={formData.branchId}
              onChange={handleChange}
              className="w-full px-3 xs:px-4 py-2 text-sm xs:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            >
              <option value="">Selectează filială (opțional)</option>
              {branches.filter(b => b.active).map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            
            {/* Orarul filialei selectate */}
            {formData.branchId && loadingSchedule && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 text-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="text-xs text-gray-500 mt-2">Se încarcă orarul...</p>
              </div>
            )}
            {formData.branchId && !loadingSchedule && branchSchedule.length > 0 && formData.scheduleDays.length === 0 && (
              <div className="mt-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-700">💡 Selectează zilele pentru a vedea orarul existent.</p>
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1.5 xs:mb-2">Zile și ore program</label>
            <div className="space-y-2 xs:space-y-3">
              {/* Butoane zile */}
              <div className="flex flex-wrap gap-1.5 xs:gap-2">
                {days.map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDayToggle(day)}
                  className={`px-2.5 xs:px-3 md:px-4 py-1.5 xs:py-2 rounded-lg text-xs xs:text-sm font-medium transition-colors ${
                    formData.scheduleDays.includes(day)
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
            
            {/* Ore per zi selectată */}
            {formData.scheduleDays.length > 0 && (
              <div className="mt-2 xs:mt-3 p-2.5 xs:p-3 md:p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-[10px] xs:text-xs text-gray-500 mb-2 xs:mb-3">Setează ora pentru fiecare zi:</p>
                <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-2 xs:gap-3">
                  {formData.scheduleDays.map(day => (
                    <div key={day} className="flex items-center gap-1.5 xs:gap-2 bg-white p-1.5 xs:p-2 rounded-lg border border-gray-200">
                      <span className="text-xs xs:text-sm font-medium text-gray-700 min-w-[50px] xs:min-w-[60px]">{day}</span>
                      <input
                        type="text"
                        value={formData.scheduleTimes[day] || '16:00'}
                        onChange={(e) => handleTimeChange(day, e.target.value)}
                        placeholder="HH:MM"
                        pattern="[0-9]{2}:[0-9]{2}"
                        className="flex-1 px-1.5 xs:px-2 py-1 xs:py-1.5 border border-gray-300 rounded text-xs xs:text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Orarul filialei pentru zilele selectate */}
            {formData.branchId && formData.scheduleDays.length > 0 && branchSchedule.length > 0 && (
              (() => {
                // Filtrează grupele care au cel puțin o zi comună cu zilele selectate
                const relevantGroups = branchSchedule.filter(g => 
                  g.scheduleDays?.some(d => formData.scheduleDays.includes(d))
                )
                if (relevantGroups.length === 0) return null
                return (
                  <div className="mt-3 p-2 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-[10px] font-semibold text-amber-800 mb-1">⚠️ Orar existent:</p>
                    <div className="space-y-0.5 max-h-32 overflow-y-auto text-[11px]">
                      {formData.scheduleDays.map(day => {
                        const dayGroups = relevantGroups.filter(g => g.scheduleDays?.includes(day))
                        if (dayGroups.length === 0) return null
                        return dayGroups
                          .sort((a, b) => {
                            const timeA = getTimeForDay(a.scheduleTime, day) || ''
                            const timeB = getTimeForDay(b.scheduleTime, day) || ''
                            return timeA.localeCompare(timeB)
                          })
                          .map(g => (
                            <div key={`${g.id}-${day}`} className="flex items-center gap-1 text-gray-700">
                              <span className="font-medium text-amber-700 min-w-[35px]">{day.slice(0,2)}</span>
                              <span className="font-mono font-bold text-amber-800">{getTimeForDay(g.scheduleTime, day) || '-'}</span>
                              <span className="text-gray-400">|</span>
                              <span className="truncate">{g.name}</span>
                              {g.locationDetails && (
                                <span className="px-1 bg-amber-200 text-amber-800 rounded text-[10px]">{g.locationDetails}</span>
                              )}
                            </div>
                          ))
                      })}
                    </div>
                  </div>
                )
              })()
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">Tip locație</label>
          <select
            name="locationType"
            value={formData.locationType}
            onChange={handleChange}
            className="w-full px-3 xs:px-4 py-2 text-sm xs:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
          >
            <option value="offline">Offline (fizic)</option>
            <option value="online">Online</option>
          </select>
        </div>

        <div>
          <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">
            {formData.locationType === 'online' ? 'Link' : 'Sală'}
          </label>
          <input
            type="text"
            name="locationDetails"
            value={formData.locationDetails}
            onChange={handleChange}
            className="w-full px-3 xs:px-4 py-2 text-sm xs:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 placeholder-gray-700"
            placeholder={formData.locationType === 'online' ? 'Link Zoom/Meet' : 'Sala 1'}
          />
        </div>

        <div>
          <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">Dată început</label>
          <input
            type="date"
            name="startDate"
            value={formData.startDate}
            onChange={handleChange}
            className="w-full px-3 xs:px-4 py-2 text-sm xs:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
          />

        </div>

        <div className="flex items-center">
          <label className="flex items-center gap-2 xs:gap-3">
            <input
              type="checkbox"
              name="active"
              checked={formData.active}
              onChange={handleChange}
              className="w-4 h-4 xs:w-5 xs:h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <span className="text-xs xs:text-sm font-medium text-gray-700">Grupă activă</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-xs xs:text-sm font-medium text-gray-700 mb-1">Detalii despre grupă</label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={3}
          placeholder="Manual folosit, condiții speciale, observații — apar și în raportul grupei"
          className="w-full px-3 xs:px-4 py-2 text-sm xs:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 resize-none"
        />
      </div>

      <div className="flex flex-col xs:flex-row gap-2 xs:gap-4 pt-3 xs:pt-4 border-t">
        <button
          type="button"
          onClick={() => router.back()}
          className="w-full xs:w-auto px-4 xs:px-6 py-2 text-sm xs:text-base border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 order-2 xs:order-1"
        >
          Anulează
        </button>
        <button
          type="submit"
          disabled={loading}
          className="w-full xs:w-auto px-4 xs:px-6 py-2 text-sm xs:text-base bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 order-1 xs:order-2"
        >
          {loading ? 'Se salvează...' : (group ? 'Actualizează' : 'Creează grupă')}
        </button>
      </div>
    </form>

    <TwoFactorModal
      isOpen={show2FA}
      onClose={() => setShow2FA(false)}
      onVerify={executeSubmit}
      title="Verificare 2FA"
      description={group ? 'Confirmă identitatea pentru a actualiza grupa.' : 'Confirmă identitatea pentru a crea grupa.'}
    />
  </>
  )
}
