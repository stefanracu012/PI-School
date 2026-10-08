'use client'

import { useState, useEffect, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { 
  BanknotesIcon, 
  UsersIcon, 
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowDownTrayIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  DocumentTextIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline'
import { usePermissions } from '@/hooks/usePermissions'
import TwoFactorModal from '@/components/admin/TwoFactorModal'
import toast from 'react-hot-toast'

export default function PaymentsPage() {
  const router = useRouter()
  const { hasPermission, isSuperAdmin } = usePermissions()
  
  // Stări pentru verificare 2FA la intrare
  const [requires2FAVerification, setRequires2FAVerification] = useState(true)
  const [show2FAModal, setShow2FAModal] = useState(false)
  const [accessGranted, setAccessGranted] = useState(false)
  const [checking2FA, setChecking2FA] = useState(true)
  
  // Verifică permisiunea
  useEffect(() => {
    if (!hasPermission('payments.view') && !isSuperAdmin) {
      router.push('/admin')
    }
  }, [hasPermission, isSuperAdmin, router])
  
  // Verifică dacă utilizatorul are 2FA și cere verificare
  useEffect(() => {
    async function check2FAStatus() {
      try {
        const res = await fetch('/api/admin/security/2fa/status')
        if (res.ok) {
          const data = await res.json()
          if (data.enabled) {
            setRequires2FAVerification(true)
            setShow2FAModal(true)
          } else {
            setAccessGranted(true)
          }
        } else {
          setAccessGranted(true)
        }
      } catch (error) {
        console.error('Error checking 2FA status:', error)
        setAccessGranted(true)
      } finally {
        setChecking2FA(false)
      }
    }
    check2FAStatus()
  }, [])
  
  // Handler pentru verificarea 2FA reușită
  const handle2FAVerify = (token) => {
    setAccessGranted(true)
    setShow2FAModal(false)
    toast.success('Acces acordat')
  }
  
  // Handler pentru închiderea modalului fără verificare (când apasă X sau în afară)
  const handle2FAClose = () => {
    // Doar dacă nu s-a acordat acces, redirecționează
    if (!accessGranted) {
      router.push('/admin')
    } else {
      setShow2FAModal(false)
    }
  }
  
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedMonth, setExpandedMonth] = useState(null)
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all') // 'all', 'cash', 'card', 'transfer'
  const [sourceFilter, setSourceFilter] = useState('all') // 'all', 'cursuri', 'app'
  const [selectedMonths, setSelectedMonths] = useState([]) // empty = all months, otherwise array of month indices 0-11
  const [selectedBranches, setSelectedBranches] = useState([]) // empty = all branches, otherwise array of branch ids
  const [selectedTeachers, setSelectedTeachers] = useState([]) // empty = all teachers, otherwise array of teacher ids

  const MONTHS = [
    'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
    'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
  ]

  const toggleMonth = (monthIndex) => {
    setSelectedMonths(prev => {
      if (prev.includes(monthIndex)) {
        return prev.filter(m => m !== monthIndex)
      } else {
        return [...prev, monthIndex].sort((a, b) => a - b)
      }
    })
  }

  const selectAllMonths = () => setSelectedMonths([])
  const clearMonths = () => setSelectedMonths([])
  
  const selectQuarter = (quarter) => {
    const quarters = {
      Q1: [0, 1, 2],
      Q2: [3, 4, 5],
      Q3: [6, 7, 8],
      Q4: [9, 10, 11]
    }
    setSelectedMonths(quarters[quarter])
  }

  const toggleBranch = (branchId) => {
    setSelectedBranches(prev => {
      if (prev.includes(branchId)) {
        return prev.filter(b => b !== branchId)
      } else {
        return [...prev, branchId]
      }
    })
  }

  const toggleTeacher = (teacherId) => {
    setSelectedTeachers(prev => {
      if (prev.includes(teacherId)) {
        return prev.filter(t => t !== teacherId)
      } else {
        return [...prev, teacherId]
      }
    })
  }

  // Plățile rămase de la elevii șterși — se pot curăța de aici
  const [orphans, setOrphans] = useState(null)
  const [orphansOpen, setOrphansOpen] = useState(false)
  const [deletingOrphans, setDeletingOrphans] = useState(false)

  useEffect(() => {
    fetchData()
  }, [year])

  useEffect(() => {
    if (!accessGranted) return
    fetch('/api/admin/payments/orphans')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setOrphans(j))
      .catch(() => {})
  }, [accessGranted])

  const deleteOrphans = async () => {
    const confirmed = confirm(
      `Ștergi definitiv ${orphans.count} plăți ale elevilor șterși, în valoare de ` +
      `${orphans.totalAmount.toLocaleString('ro-RO')} MDL?\n\n` +
      'Nu se mai pot recupera, iar încasările din rapoarte și din statistică vor scădea cu suma asta.'
    )
    if (!confirmed) return

    setDeletingOrphans(true)
    try {
      const res = await fetch(`/api/admin/payments/orphans?expected=${orphans.count}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eroare la ștergere')

      toast.success(`${json.deleted} plăți șterse`)
      setOrphans({ count: 0, totalAmount: 0, students: [], canDelete: orphans.canDelete })
      setOrphansOpen(false)
      fetchData()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setDeletingOrphans(false)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/payments/stats?year=${year}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (error) {
      console.error('Error fetching payment stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const exportToExcel = () => {
    if (!filteredData) return

    const currentDate = new Date().toLocaleDateString('ro-RO', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const showMethodColumn = paymentMethodFilter === 'all'
    const colSpan = showMethodColumn ? 8 : 7
    
    // Generate filter description
    const monthFilterText = selectedMonths.length === 0 
      ? 'Toate lunile' 
      : selectedMonths.map(idx => MONTHS[idx]).join(', ')
    const methodFilterText = paymentMethodFilter === 'all' ? 'Toate metodele' : 
      paymentMethodFilter === 'cash' ? 'Numerar' :
      paymentMethodFilter === 'card' ? 'Card' :
      paymentMethodFilter === 'card-transfer' ? 'Card/Transfer' : 'Transfer'
    const branchFilterText = selectedBranches.length === 0 ? 'Toate filialele' :
      selectedBranches.map(b => b === 'none' ? 'Fără filială' : data?.branches?.find(br => br.id === b)?.name || b).join(', ')
    const teacherFilterText = selectedTeachers.length === 0 ? 'Toți profesorii' :
      selectedTeachers.map(t => data?.teachers?.find(te => te.id === t)?.name || t).join(', ')
    
    // Only include months that have payments (not filtered out)
    const visibleMonths = filteredData.months.filter(m => !m.filtered && m.totalPayments > 0)

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Raport Plăți ${year}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1100px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    
    table { border-collapse: collapse; width: 100%; margin-bottom: 25px; }
    th { 
      background: #10b981; 
      color: white; 
      padding: 14px 10px; 
      text-align: center; 
      font-weight: 600;
      border: 2px solid #059669;
      font-size: 13px;
    }
    td { 
      padding: 12px 10px; 
      border: 1px solid #d1d5db;
      font-size: 13px;
    }
    
    .title {
      background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
      color: white;
      font-size: 20px;
      font-weight: bold;
      padding: 18px;
      text-align: center;
      border: none;
    }
    .subtitle {
      background: #f1f5f9;
      color: #475569;
      font-size: 12px;
      padding: 10px;
      text-align: center;
      border: 1px solid #e2e8f0;
    }
    .section-title {
      background: #3b82f6;
      color: white;
      font-weight: bold;
      padding: 12px;
      font-size: 14px;
      border: 2px solid #2563eb;
      text-align: left;
    }
    
    .row-even { background: #f8fafc; }
    .row-odd { background: #ffffff; }
    tr:hover { background: #f0fdf4; }
    
    .amount { text-align: right; font-weight: 600; color: #059669; }
    .center { text-align: center; }
    .date-cell { 
      text-align: center; 
      font-size: 14px; 
      font-weight: 500; 
      min-width: 110px; 
      white-space: nowrap;
    }
    
    .cash { background: #dcfce7; color: #166534; font-weight: 500; }
    .card { background: #dbeafe; color: #1e40af; font-weight: 500; }
    .transfer { background: #f3e8ff; color: #7e22ce; font-weight: 500; }
    
    .total-row { background: #fef3c7 !important; font-weight: bold; }
    .total-row td { border: 2px solid #f59e0b; font-size: 14px; }
    
    .grand-total {
      background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
      color: white;
      font-weight: bold;
      font-size: 16px;
      padding: 15px;
      text-align: center;
      border: none;
    }
    
    .spacer { height: 20px; border: none !important; background: white !important; }
    .spacer td { border: none !important; }
    
    .actions { text-align: center; margin: 30px 0; }
    .btn { 
      display: inline-flex; 
      align-items: center; 
      gap: 8px; 
      padding: 14px 35px; 
      border: none; 
      border-radius: 10px; 
      font-size: 15px; 
      font-weight: 500;
      cursor: pointer; 
      margin: 0 10px;
      transition: all 0.2s;
    }
    .btn-print { background: #10b981; color: white; }
    .btn-print:hover { background: #059669; }
    .btn-copy { background: #3b82f6; color: white; }
    .btn-copy:hover { background: #2563eb; }
    .icon { width: 20px; height: 20px; }
    .hint { color: #64748b; font-size: 13px; margin-top: 12px; }
    
    @media print {
      body { background: white; padding: 0; }
      .container { box-shadow: none; padding: 10px; }
      .actions { display: none; }
      table { font-size: 11px; }
      th { padding: 8px 5px; }
      td { padding: 6px 5px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <table id="main-table">
      <tr><td colspan="${colSpan}" class="title">RAPORT PLĂȚI ${year}${selectedMonths.length > 0 ? ' - ' + monthFilterText : ''}</td></tr>
      <tr><td colspan="${colSpan}" class="subtitle">PI School | Generat: ${currentDate} | Filtre: ${monthFilterText} • ${methodFilterText} • ${branchFilterText}</td></tr>
      <tr class="spacer"><td colspan="${colSpan}"></td></tr>
      
      <tr><td colspan="${colSpan}" class="section-title">TOATE PLĂȚILE</td></tr>
      <tr>
        <th style="width: 45px;">Nr.</th>
        <th style="width: 120px;">Data</th>
        <th>Elev</th>
        <th>Grupa</th>
        ${showMethodColumn ? '<th style="width: 100px;">Metoda Plată</th>' : ''}
        <th style="width: 55px;">Lecții</th>
        <th style="width: 130px;">Suma (MDL)</th>
        <th style="width: 90px;">Luna</th>
      </tr>
      ${(() => {
        let rows = ''
        let nr = 1
        visibleMonths.forEach(month => {
          month.payments.forEach(p => {
            const metodaPlata = p.paymentMethod === 'cash' ? 'Numerar' : p.paymentMethod === 'card' ? 'Card' : 'Transfer'
            const metodaClass = p.paymentMethod === 'cash' ? 'cash' : p.paymentMethod === 'card' ? 'card' : 'transfer'
            const dataPlata = new Date(p.paymentDate).toLocaleDateString('ro-RO')
            rows += `<tr class="${nr % 2 === 0 ? 'row-even' : 'row-odd'}">
              <td class="center">${nr}</td>
              <td class="date-cell">${dataPlata}</td>
              <td>${p.studentName}</td>
              <td>${p.groupName}</td>
              ${showMethodColumn ? `<td class="center ${metodaClass}">${metodaPlata}</td>` : ''}
              <td class="center">${p.lessonsAdded || '-'}</td>
              <td class="amount">${p.amount.toLocaleString('ro-RO')} MDL</td>
              <td class="center">${month.month}</td>
            </tr>`
            nr++
          })
        })
        return rows
      })()}
      <tr class="total-row">
        <td colspan="${showMethodColumn ? 6 : 5}" style="text-align: right;">TOTAL${selectedMonths.length > 0 ? ' (' + monthFilterText + ')' : ' ' + year}:</td>
        <td class="amount" style="color: #b45309;">${filteredData.yearTotal.totalAmount.toLocaleString('ro-RO')} MDL</td>
        <td class="center">${filteredData.yearTotal.totalPayments} plăți</td>
      </tr>
      
      <tr class="spacer"><td colspan="${colSpan}"></td></tr>
      <tr class="spacer"><td colspan="${colSpan}"></td></tr>
      
      <tr><td colspan="${colSpan}" class="section-title">SUMAR PE LUNI</td></tr>
      <tr>
        <th colspan="2">Luna</th>
        <th colspan="2">Suma (MDL)</th>
        <th colspan="${showMethodColumn ? 2 : 1}">Nr. Plăți</th>
        <th colspan="2">Elevi Unici</th>
      </tr>
      ${visibleMonths.map((month, idx) => `
        <tr class="${idx % 2 === 0 ? 'row-even' : 'row-odd'}">
          <td colspan="2" style="font-weight: 600;">${month.month}</td>
          <td colspan="2" class="amount">${month.totalAmount.toLocaleString('ro-RO')} MDL</td>
          <td colspan="${showMethodColumn ? 2 : 1}" class="center">${month.totalPayments}</td>
          <td colspan="2" class="center">${month.uniqueStudents}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td colspan="2" style="font-weight: bold;">TOTAL${selectedMonths.length > 0 ? '' : ' AN'}</td>
        <td colspan="2" class="amount" style="color: #b45309;">${filteredData.yearTotal.totalAmount.toLocaleString('ro-RO')} MDL</td>
        <td colspan="${showMethodColumn ? 2 : 1}" class="center">${filteredData.yearTotal.totalPayments}</td>
        <td colspan="2" class="center">${filteredData.yearTotal.uniqueStudents}</td>
      </tr>
      
      <tr class="spacer"><td colspan="${colSpan}"></td></tr>
      
      <tr><td colspan="${colSpan}" class="grand-total">
        TOTAL ÎNCASAT${selectedMonths.length > 0 ? ' (' + monthFilterText + ')' : ' ÎN ' + year}: ${filteredData.yearTotal.totalAmount.toLocaleString('ro-RO')} MDL
      </td></tr>
    </table>
    
    <div class="actions">
      <button class="btn btn-print" onclick="window.print()">
        <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
        Printează
      </button>
      <button class="btn btn-copy" onclick="copyTable()">
        <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
        Copiază pentru Excel
      </button>
      <p class="hint">După copiere, deschide Excel și apasă Ctrl+V</p>
    </div>
  </div>
  
  <script>
    function copyTable() {
      const table = document.getElementById('main-table');
      const range = document.createRange();
      range.selectNode(table);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.execCommand('copy');
      window.getSelection().removeAllRanges();
      alert('Tabelul a fost copiat! Deschide Excel și apasă Ctrl+V');
    }
  </script>
</body>
</html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  const exportToHTML = () => {
    if (!filteredData) return

    const showMethodColumn = paymentMethodFilter === 'all'
    
    // Generate filter description
    const monthFilterText = selectedMonths.length === 0 
      ? 'Toate lunile' 
      : selectedMonths.map(idx => MONTHS[idx]).join(', ')
    const methodFilterText = paymentMethodFilter === 'all' ? 'Toate metodele' : 
      paymentMethodFilter === 'cash' ? 'Numerar' :
      paymentMethodFilter === 'card' ? 'Card' :
      paymentMethodFilter === 'card-transfer' ? 'Card/Transfer' : 'Transfer'
    const branchFilterTextHTML = selectedBranches.length === 0 ? 'Toate filialele' :
      selectedBranches.map(b => b === 'none' ? 'Fără filială' : data?.branches?.find(br => br.id === b)?.name || b).join(', ')
    const teacherFilterTextHTML = selectedTeachers.length === 0 ? 'Toți profesorii' :
      selectedTeachers.map(t => data?.teachers?.find(te => te.id === t)?.name || t).join(', ')
    
    // Only include months that have payments (not filtered out)
    const visibleMonths = filteredData.months.filter(m => !m.filtered)

    const html = `
<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8">
  <title>Raport Plăți ${year} - PI School</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      background: #f8fafc; 
      padding: 40px;
      color: #1e293b;
    }
    .container { max-width: 900px; margin: 0 auto; }
    .header { 
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 40px;
      border-radius: 20px;
      margin-bottom: 30px;
      text-align: center;
    }
    .header h1 { font-size: 28px; margin-bottom: 8px; }
    .header p { opacity: 0.9; font-size: 16px; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: white;
      padding: 24px;
      border-radius: 16px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      text-align: center;
    }
    .stat-card .value { 
      font-size: 32px; 
      font-weight: 700; 
      color: #10b981;
      margin-bottom: 4px;
    }
    .stat-card .label { color: #64748b; font-size: 14px; }
    .table-container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      overflow: hidden;
      margin-bottom: 30px;
    }
    .table-header {
      background: #f1f5f9;
      padding: 16px 24px;
      font-weight: 600;
      font-size: 16px;
      border-bottom: 1px solid #e2e8f0;
    }
    table { width: 100%; border-collapse: collapse; }
    th { 
      background: #f8fafc;
      padding: 14px 20px;
      text-align: left;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      color: #64748b;
      border-bottom: 2px solid #e2e8f0;
    }
    td { 
      padding: 16px 20px;
      border-bottom: 1px solid #f1f5f9;
    }
    tr:hover { background: #f8fafc; }
    .amount { 
      font-weight: 600; 
      color: #10b981;
    }
    .total-row { 
      background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important;
      color: white;
    }
    .total-row td { 
      font-weight: 700; 
      padding: 20px;
    }
    .total-row .amount { color: #4ade80; }
    .month-badge {
      display: inline-block;
      padding: 4px 12px;
      background: #ecfdf5;
      color: #059669;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
    }
    .current-month {
      background: #10b981;
      color: white;
    }
    .details-section {
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      padding: 24px;
      margin-bottom: 30px;
    }
    .details-section h3 {
      font-size: 18px;
      margin-bottom: 20px;
      color: #1e293b;
    }
    .payment-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #f8fafc;
      border-radius: 10px;
      margin-bottom: 8px;
    }
    .payment-item .student { font-weight: 500; }
    .payment-item .group { color: #64748b; font-size: 14px; }
    .payment-item .method {
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
    }
    .method-cash { background: #dcfce7; color: #16a34a; }
    .method-card { background: #dbeafe; color: #2563eb; }
    .method-transfer { background: #f3e8ff; color: #9333ea; }
    .footer {
      text-align: center;
      color: #94a3b8;
      font-size: 12px;
      padding-top: 20px;
    }
    @media print {
      body { background: white; padding: 20px; }
      .stat-card, .table-container, .details-section { 
        box-shadow: none;
        border: 1px solid #e2e8f0;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1><svg style="display:inline-block;vertical-align:middle;width:28px;height:28px;margin-right:8px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>Raport Plăți ${year}${selectedMonths.length > 0 ? ' - ' + monthFilterText : ''}</h1>
      <p>PI School • Generat la ${new Date().toLocaleDateString('ro-RO', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      <p style="margin-top: 8px; font-size: 14px; opacity: 0.9;">Filtre: ${monthFilterText} • ${methodFilterText} • ${branchFilterTextHTML}</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="value">${filteredData.yearTotal.totalAmount.toLocaleString('ro-RO')} MDL</div>
        <div class="label">Total Încasat</div>
      </div>
      ${filteredData.yearTotal.totalDebt > 0 ? `
      <div class="stat-card">
        <div class="value" style="color:#dc2626">${filteredData.yearTotal.totalDebt.toLocaleString('ro-RO')} MDL</div>
        <div class="label">Datorii rămase</div>
      </div>` : ''}
      <div class="stat-card">
        <div class="value">${filteredData.yearTotal.totalPayments}</div>
        <div class="label">Total Plăți</div>
      </div>
      <div class="stat-card">
        <div class="value">${filteredData.yearTotal.uniqueStudents}</div>
        <div class="label">Elevi Unici</div>
      </div>
    </div>

    <div class="table-container">
      <div class="table-header"><svg style="display:inline-block;vertical-align:middle;width:18px;height:18px;margin-right:8px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>Încasări Lunare</div>
      <table>
        <thead>
          <tr>
            <th>Luna</th>
            <th>Suma (MDL)</th>
            <th>Nr. Plăți</th>
            <th>Elevi Unici</th>
          </tr>
        </thead>
        <tbody>
          ${visibleMonths.map((month, idx) => `
            <tr>
              <td>
                ${month.month}
                ${year === new Date().getFullYear() && filteredData.months.indexOf(month) === new Date().getMonth() ? '<span class="month-badge current-month">Luna curentă</span>' : ''}
              </td>
              <td class="amount">${month.totalAmount.toLocaleString('ro-RO')} MDL</td>
              <td>${month.totalPayments}</td>
              <td>${month.uniqueStudents}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td>TOTAL${selectedMonths.length > 0 ? '' : ' ' + year}</td>
            <td class="amount">${filteredData.yearTotal.totalAmount.toLocaleString('ro-RO')} MDL</td>
            <td>${filteredData.yearTotal.totalPayments}</td>
            <td>${filteredData.yearTotal.uniqueStudents}</td>
          </tr>
        </tbody>
      </table>
    </div>

    ${visibleMonths.filter(m => m.payments.length > 0).map(month => `
      <div class="details-section">
        <h3><svg style="display:inline-block;vertical-align:middle;width:20px;height:20px;margin-right:8px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>Plăți în ${month.month} (${month.payments.length})</h3>
        ${month.payments.map(p => `
          <div class="payment-item">
            <div>
              <div class="student">${p.studentName}</div>
              <div class="group">${p.groupName} • ${new Date(p.paymentDate).toLocaleDateString('ro-RO')}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              ${showMethodColumn ? `<span class="method method-${p.paymentMethod}">${p.paymentMethod === 'cash' ? 'Numerar' : p.paymentMethod === 'card' ? 'Card' : 'Transfer'}</span>` : ''}
              ${p.lessonsAdded ? `<span style="color: #6366f1; font-size: 12px;">+${p.lessonsAdded} lecții</span>` : ''}
              <strong class="amount">${p.amount.toLocaleString('ro-RO')} MDL</strong>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('')}

    <div class="footer">
      <p>Raport generat automat din sistemul PI School</p>
      <p style="margin-top: 4px;">© ${new Date().getFullYear()} PI School. Toate drepturile rezervate.</p>
    </div>
  </div>
</body>
</html>
    `

    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  const currentMonth = new Date().getMonth()
  
  // Filter data based on payment method, branch, teacher, and selected months
  // ignoreTeacherFilter: pentru „Profit adus de profesori", unde cardurile SUNT
  // selectorul de profesor — altfel, la selectarea unuia ar dispărea toate celelalte
  const filterPayment = (p, { ignoreTeacherFilter = false } = {}) => {
    // Filter by source
    if (sourceFilter !== 'all' && p.source !== sourceFilter) return false
    // Filter by payment method
    if (paymentMethodFilter !== 'all') {
      if (paymentMethodFilter === 'card-transfer') {
        if (p.paymentMethod !== 'card' && p.paymentMethod !== 'transfer') return false
      } else if (p.paymentMethod !== paymentMethodFilter) {
        return false
      }
    }
    // Filter by branches (multiple select)
    if (selectedBranches.length > 0) {
      if (selectedBranches.includes('none')) {
        // If 'none' is selected, include payments without branch OR with selected branches
        const otherBranches = selectedBranches.filter(b => b !== 'none')
        if (!p.branchId && otherBranches.length === 0) {
          // Only 'none' selected - include only payments without branch
        } else if (p.branchId && !otherBranches.includes(p.branchId)) {
          return false
        } else if (!p.branchId && otherBranches.length > 0) {
          // Has other branches selected but this payment has no branch - still include
        }
      } else if (!selectedBranches.includes(p.branchId)) {
        return false
      }
    }
    // Filter by teachers (who created the payment)
    if (!ignoreTeacherFilter && selectedTeachers.length > 0) {
      if (!selectedTeachers.includes(p.createdById)) {
        return false
      }
    }
    return true
  }

  const filterMonth = (monthIndex) => {
    if (selectedMonths.length === 0) return true // no filter = show all
    return selectedMonths.includes(monthIndex)
  }

  const filteredData = data ? {
    ...data,
    months: data.months.map((month, monthIndex) => {
      // First check if this month is in the filter
      if (!filterMonth(monthIndex)) {
        return {
          ...month,
          payments: [],
          totalAmount: 0,
          totalDebt: 0,
          totalPayments: 0,
          uniqueStudents: 0,
          filtered: true // mark as filtered out
        }
      }
      
      const filteredPayments = month.payments.filter(p => filterPayment(p))
      
      return {
        ...month,
        payments: filteredPayments,
        totalAmount: filteredPayments.reduce((sum, p) => sum + p.amount, 0),
        totalDebt: filteredPayments.reduce((sum, p) => sum + (p.debt || 0), 0),
        totalPayments: filteredPayments.length,
        uniqueStudents: new Set(filteredPayments.map(p => p.studentId)).size,
        filtered: false
      }
    }),
    yearTotal: (() => {
      const allFilteredPayments = data.months.flatMap((m, idx) => 
        filterMonth(idx) ? m.payments.filter(p => filterPayment(p)) : []
      )
      return {
        totalAmount: allFilteredPayments.reduce((sum, p) => sum + p.amount, 0),
        totalDebt: allFilteredPayments.reduce((sum, p) => sum + (p.debt || 0), 0),
        totalPayments: allFilteredPayments.length,
        uniqueStudents: new Set(allFilteredPayments.map(p => p.studentId)).size
      }
    })(),
    // Recalculat aici, nu preluat din API: cel de pe server e pe tot anul și
    // ignoră filtrele de lună/filială/metodă/sursă
    teacherStats: (() => {
      const stats = {}
      data.months.forEach((m, idx) => {
        if (!filterMonth(idx)) return
        m.payments.forEach(p => {
          // Doar plățile de curs — cele din /learn sunt înregistrate de aplicație, nu de profesor
          if (p.source !== 'cursuri') return
          if (!filterPayment(p, { ignoreTeacherFilter: true })) return
          const id = p.createdById || 'unknown'
          if (!stats[id]) {
            stats[id] = { id, name: p.createdByName || 'Administratori', totalAmount: 0, totalPayments: 0 }
          }
          stats[id].totalAmount += p.amount
          stats[id].totalPayments += 1
        })
      })
      return Object.values(stats).sort((a, b) => b.totalAmount - a.totalAmount)
    })()
  } : null
  
  // Calculate max amount for visual bars
  const maxMonthAmount = filteredData ? Math.max(...filteredData.months.map(m => m.totalAmount), 1) : 1

  // Verificare 2FA în așteptare
  if (checking2FA) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  // Afișează ecranul de verificare 2FA dacă nu a fost verificat
  if (!accessGranted && requires2FAVerification) {
    return (
      <>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Verificare 2FA necesară</h2>
            <p className="text-gray-600 mb-4">Această pagină necesită verificare suplimentară.</p>
            <button
              onClick={() => setShow2FAModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Verifică identitatea
            </button>
          </div>
        </div>
        <TwoFactorModal
          isOpen={show2FAModal}
          onClose={handle2FAClose}
          onVerify={handle2FAVerify}
          title="Verificare 2FA"
          description="Introdu codul din aplicația de autentificare pentru a accesa statisticile de plăți."
        />
      </>
    )
  }

  return (
    <div className="space-y-4 xs:space-y-6 md:space-y-8">
      {/* Header with gradient background */}
      <div className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 rounded-2xl xs:rounded-3xl p-4 xs:p-6 md:p-8 text-white shadow-xl shadow-green-500/20">
        <div className="flex flex-col gap-3 xs:gap-4">
          <div className="flex items-center gap-2 xs:gap-3 md:gap-4">
            <div className="p-2 xs:p-3 md:p-4 bg-white/20 rounded-xl xs:rounded-2xl backdrop-blur-sm">
              <BanknotesIcon className="w-6 h-6 xs:w-8 xs:h-8 md:w-10 md:h-10" />
            </div>
            <div>
              <h1 className="text-lg xs:text-xl md:text-3xl font-bold">Statistici Plăți</h1>
              <p className="text-green-100 mt-0.5 xs:mt-1 text-xs xs:text-sm md:text-base">Monitorizare încasări și plăți</p>
            </div>
          </div>
          <div className="flex items-center gap-2 xs:gap-3">
            <button
              onClick={exportToHTML}
              disabled={!data}
              className="inline-flex items-center gap-1 xs:gap-2 px-3 xs:px-4 md:px-5 py-2 xs:py-2.5 md:py-3 bg-white text-emerald-600 rounded-lg xs:rounded-xl text-xs xs:text-sm font-medium hover:bg-green-50 disabled:opacity-50 transition-all shadow-lg"
            >
              <DocumentTextIcon className="w-4 h-4 xs:w-5 xs:h-5" />
              <span className="hidden xs:inline">Raport Detaliat</span>
              <span className="xs:hidden">Raport</span>
            </button>
            <button
              onClick={exportToExcel}
              disabled={!data}
              className="inline-flex items-center gap-1 xs:gap-2 px-3 xs:px-4 md:px-5 py-2 xs:py-2.5 md:py-3 bg-white/20 backdrop-blur-sm text-white rounded-lg xs:rounded-xl text-xs xs:text-sm font-medium hover:bg-white/30 disabled:opacity-50 transition-all border border-white/30"
            >
              <ArrowDownTrayIcon className="w-4 h-4 xs:w-5 xs:h-5" />
              <span className="hidden xs:inline">Tabel Export</span>
              <span className="xs:hidden">Export</span>
            </button>
          </div>
        </div>

        {/* Year Selector - Inside header */}
        <div className="flex items-center justify-center gap-3 xs:gap-4 md:gap-6 mt-4 xs:mt-6 md:mt-8">
          <button
            onClick={() => setYear(y => y - 1)}
            className="p-2 xs:p-2.5 md:p-3 rounded-lg xs:rounded-xl bg-white/20 hover:bg-white/30 transition-colors"
          >
            <ChevronLeftIcon className="w-5 h-5 xs:w-6 xs:h-6" />
          </button>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl xs:rounded-2xl px-4 xs:px-6 md:px-8 py-2 xs:py-2.5 md:py-3 min-w-[120px] xs:min-w-[160px] text-center">
            <span className="text-2xl xs:text-3xl md:text-4xl font-bold">{year}</span>
          </div>
          <button
            onClick={() => setYear(y => y + 1)}
            disabled={year >= new Date().getFullYear()}
            className="p-2 xs:p-2.5 md:p-3 rounded-lg xs:rounded-xl bg-white/20 hover:bg-white/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRightIcon className="w-5 h-5 xs:w-6 xs:h-6" />
          </button>
        </div>
      </div>

      {/* Plăți rămase de la elevi șterși */}
      {orphans?.count > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl xs:rounded-2xl p-3 xs:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                {orphans.count} plăți rămase de la elevi șterși
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                {orphans.totalAmount.toLocaleString('ro-RO')} MDL, de la {orphans.students.length}{' '}
                {orphans.students.length === 1 ? 'elev' : 'elevi'}. Sunt numărate în încasări, dar
                elevul lor nu mai există în sistem.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setOrphansOpen((v) => !v)}
                className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                {orphansOpen ? 'Ascunde lista' : 'Vezi lista'}
              </button>
              {orphans.canDelete && (
                <button
                  onClick={deleteOrphans}
                  disabled={deletingOrphans}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {deletingOrphans ? 'Se șterge…' : 'Șterge-le definitiv'}
                </button>
              )}
            </div>
          </div>

          {orphansOpen && (
            <div className="mt-3 pt-3 border-t border-amber-200 max-h-64 overflow-y-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-amber-900/70">
                    <th className="text-left font-medium py-1">Elev</th>
                    <th className="text-left font-medium py-1">Grupe</th>
                    <th className="text-center font-medium py-1">Plăți</th>
                    <th className="text-right font-medium py-1">Total</th>
                    <th className="text-right font-medium py-1">Ultima</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {orphans.students.map((st) => (
                    <tr key={st.name}>
                      <td className="py-1 pr-2 text-gray-900 font-medium">{st.name}</td>
                      <td className="py-1 pr-2 text-gray-600">{st.groups.join(', ') || '—'}</td>
                      <td className="py-1 text-center text-gray-600">{st.payments}</td>
                      <td className="py-1 text-right text-gray-900 whitespace-nowrap">
                        {st.amount.toLocaleString('ro-RO')} MDL
                      </td>
                      <td className="py-1 text-right text-gray-500 whitespace-nowrap">
                        {st.lastPaymentAt
                          ? new Date(st.lastPaymentAt).toLocaleDateString('ro-RO')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!orphans.canDelete && (
            <p className="text-[11px] text-amber-700 mt-2">
              Ștergerea o poate face doar superadminul.
            </p>
          )}
        </div>
      )}

      {/* Payment Method Filter */}
      <div className="flex items-center justify-center gap-2 flex-wrap px-1 xs:px-0">
        <span className="text-gray-500 font-medium text-xs xs:text-sm w-full xs:w-auto text-center xs:text-left xs:mr-2 mb-1 xs:mb-0">Filtrează după:</span>
        <button
          onClick={() => setPaymentMethodFilter('all')}
          className={`px-3 xs:px-4 md:px-5 py-1.5 xs:py-2 md:py-2.5 rounded-lg xs:rounded-xl text-xs xs:text-sm font-medium transition-all ${
            paymentMethodFilter === 'all'
              ? 'bg-gradient-to-r from-gray-700 to-gray-800 text-white shadow-lg'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Toate
        </button>
        <button
          onClick={() => setPaymentMethodFilter('cash')}
          className={`px-3 xs:px-4 md:px-5 py-1.5 xs:py-2 md:py-2.5 rounded-lg xs:rounded-xl text-xs xs:text-sm font-medium transition-all inline-flex items-center gap-1 xs:gap-2 ${
            paymentMethodFilter === 'cash'
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/30'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-green-50 hover:border-green-200'
          }`}
        >
          <span className="text-base xs:text-lg">💵</span> <span className="hidden xs:inline">Numerar</span><span className="xs:hidden">Num.</span>
        </button>
        <button
          onClick={() => setPaymentMethodFilter('card-transfer')}
          className={`px-3 xs:px-4 md:px-5 py-1.5 xs:py-2 md:py-2.5 rounded-lg xs:rounded-xl text-xs xs:text-sm font-medium transition-all inline-flex items-center gap-1 xs:gap-2 ${
            paymentMethodFilter === 'card-transfer'
              ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-indigo-50 hover:border-indigo-200'
          }`}
        >
          <span className="text-base xs:text-lg">💳🏦</span> <span className="hidden xs:inline">Card/Transfer</span><span className="xs:hidden">C/T</span>
        </button>
        <button
          onClick={() => setPaymentMethodFilter('card')}
          className={`px-3 xs:px-4 md:px-5 py-1.5 xs:py-2 md:py-2.5 rounded-lg xs:rounded-xl text-xs xs:text-sm font-medium transition-all inline-flex items-center gap-1 xs:gap-2 ${
            paymentMethodFilter === 'card'
              ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-blue-50 hover:border-blue-200'
          }`}
        >
          <span className="text-base xs:text-lg">💳</span> Card
        </button>
        <button
          onClick={() => setPaymentMethodFilter('transfer')}
          className={`px-3 xs:px-4 md:px-5 py-1.5 xs:py-2 md:py-2.5 rounded-lg xs:rounded-xl text-xs xs:text-sm font-medium transition-all inline-flex items-center gap-1 xs:gap-2 ${
            paymentMethodFilter === 'transfer'
              ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/30'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-purple-50 hover:border-purple-200'
          }`}
        >
          <span className="text-base xs:text-lg">🏦</span> <span className="hidden xs:inline">Transfer</span><span className="xs:hidden">Transf.</span>
        </button>
      </div>

      {/* Source Filter - App vs Cursuri */}
      <div className="flex items-center justify-center gap-2 flex-wrap px-1 xs:px-0">
        <span className="text-gray-500 font-medium text-xs xs:text-sm w-full xs:w-auto text-center xs:text-left xs:mr-2 mb-1 xs:mb-0">Sursă:</span>
        {[
          { value: 'all', label: 'Toate', emoji: '📋', active: 'from-gray-700 to-gray-800' },
          { value: 'cursuri', label: 'Grupe', emoji: '📚', active: 'from-emerald-500 to-teal-600 shadow-emerald-500/30' },
          { value: 'app', label: 'Aplicație /learn', emoji: '📱', active: 'from-blue-700 to-blue-600 shadow-blue-500/30' },
        ].map(opt => (
          <button key={opt.value} onClick={() => setSourceFilter(opt.value)}
            className={`px-3 xs:px-4 md:px-5 py-1.5 xs:py-2 md:py-2.5 rounded-lg xs:rounded-xl text-xs xs:text-sm font-medium transition-all inline-flex items-center gap-1 xs:gap-2 ${
              sourceFilter === opt.value
                ? `bg-gradient-to-r ${opt.active} text-white shadow-lg`
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}>
            <span className="text-base xs:text-lg">{opt.emoji}</span> {opt.label}
          </button>
        ))}
      </div>

      {/* Branch Filter - Multi-select */}
      {data?.branches && data.branches.length > 0 && (
        <div className="flex items-center justify-center gap-2 flex-wrap px-1 xs:px-0">
          <span className="text-gray-500 font-medium text-xs xs:text-sm w-full xs:w-auto text-center xs:text-left xs:mr-2 mb-1 xs:mb-0">
            Filiale: {selectedBranches.length === 0 ? '(toate)' : `(${selectedBranches.length})`}
          </span>
          <button
            onClick={() => setSelectedBranches([])}
            className={`px-3 xs:px-4 md:px-5 py-1.5 xs:py-2 md:py-2.5 rounded-lg xs:rounded-xl text-xs xs:text-sm font-medium transition-all ${
              selectedBranches.length === 0
                ? 'bg-gradient-to-r from-gray-700 to-gray-800 text-white shadow-lg'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Toate
          </button>
          {data.branches.map(branch => (
            <button
              key={branch.id}
              onClick={() => toggleBranch(branch.id)}
              className={`px-3 xs:px-4 md:px-5 py-1.5 xs:py-2 md:py-2.5 rounded-lg xs:rounded-xl text-xs xs:text-sm font-medium transition-all inline-flex items-center gap-1 xs:gap-2 ${
                selectedBranches.includes(branch.id)
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-amber-50 hover:border-amber-200'
              }`}
            >
              <span className="text-base xs:text-lg">📍</span> {branch.name}
            </button>
          ))}
          <button
            onClick={() => toggleBranch('none')}
            className={`px-3 xs:px-4 md:px-5 py-1.5 xs:py-2 md:py-2.5 rounded-lg xs:rounded-xl text-xs xs:text-sm font-medium transition-all inline-flex items-center gap-1 xs:gap-2 ${
              selectedBranches.includes('none')
                ? 'bg-gradient-to-r from-gray-400 to-gray-500 text-white shadow-lg'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <span className="text-base xs:text-lg">❓</span> <span className="hidden xs:inline">Fără filială</span><span className="xs:hidden">N/A</span>
          </button>
        </div>
      )}

      {/* Teacher Filter - Multi-select */}
      {data?.teachers && data.teachers.length > 0 && (
        <div className="flex items-center justify-center gap-2 flex-wrap px-1 xs:px-0">
          <span className="text-gray-500 font-medium text-xs xs:text-sm w-full xs:w-auto text-center xs:text-left xs:mr-2 mb-1 xs:mb-0">
            Profesori: {selectedTeachers.length === 0 ? '(toți)' : `(${selectedTeachers.length})`}
          </span>
          <button
            onClick={() => setSelectedTeachers([])}
            className={`px-3 xs:px-4 md:px-5 py-1.5 xs:py-2 md:py-2.5 rounded-lg xs:rounded-xl text-xs xs:text-sm font-medium transition-all ${
              selectedTeachers.length === 0
                ? 'bg-gradient-to-r from-gray-700 to-gray-800 text-white shadow-lg'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Toți
          </button>
          {data.teachers.map(teacher => (
            <button
              key={teacher.id}
              onClick={() => toggleTeacher(teacher.id)}
              className={`px-3 xs:px-4 md:px-5 py-1.5 xs:py-2 md:py-2.5 rounded-lg xs:rounded-xl text-xs xs:text-sm font-medium transition-all inline-flex items-center gap-1 xs:gap-2 ${
                selectedTeachers.includes(teacher.id)
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-indigo-50 hover:border-indigo-200'
              }`}
            >
              <UserGroupIcon className="w-4 h-4 xs:w-5 xs:h-5" /> {teacher.name}
            </button>
          ))}
        </div>
      )}

      {/* Month Filter */}
      <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-3 xs:p-4">
        <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2 xs:gap-3 mb-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 xs:w-5 xs:h-5 text-gray-400" />
            <span className="text-gray-700 font-medium text-xs xs:text-sm">Filtrare pe luni:</span>
            {selectedMonths.length > 0 && (
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                {selectedMonths.length} {selectedMonths.length === 1 ? 'lună' : 'luni'} selectate
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 xs:gap-2 flex-wrap">
            <button
              onClick={selectAllMonths}
              className={`px-2 xs:px-3 py-1 xs:py-1.5 rounded-lg text-[10px] xs:text-xs font-medium transition-all ${
                selectedMonths.length === 0 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Toate lunile
            </button>
            <button
              onClick={() => selectQuarter('Q1')}
              className={`px-2 xs:px-3 py-1 xs:py-1.5 rounded-lg text-[10px] xs:text-xs font-medium transition-all ${
                JSON.stringify(selectedMonths) === JSON.stringify([0,1,2])
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-blue-50'
              }`}
            >
              Q1
            </button>
            <button
              onClick={() => selectQuarter('Q2')}
              className={`px-2 xs:px-3 py-1 xs:py-1.5 rounded-lg text-[10px] xs:text-xs font-medium transition-all ${
                JSON.stringify(selectedMonths) === JSON.stringify([3,4,5])
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-blue-50'
              }`}
            >
              Q2
            </button>
            <button
              onClick={() => selectQuarter('Q3')}
              className={`px-2 xs:px-3 py-1 xs:py-1.5 rounded-lg text-[10px] xs:text-xs font-medium transition-all ${
                JSON.stringify(selectedMonths) === JSON.stringify([6,7,8])
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-blue-50'
              }`}
            >
              Q3
            </button>
            <button
              onClick={() => selectQuarter('Q4')}
              className={`px-2 xs:px-3 py-1 xs:py-1.5 rounded-lg text-[10px] xs:text-xs font-medium transition-all ${
                JSON.stringify(selectedMonths) === JSON.stringify([9,10,11])
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-blue-50'
              }`}
            >
              Q4
            </button>
          </div>
        </div>
        <div className="grid grid-cols-4 xs:grid-cols-6 md:grid-cols-12 gap-1.5 xs:gap-2">
          {MONTHS.map((month, idx) => (
            <button
              key={month}
              onClick={() => toggleMonth(idx)}
              className={`px-1.5 xs:px-2 py-2 xs:py-2.5 rounded-lg text-[10px] xs:text-xs font-medium transition-all ${
                selectedMonths.length === 0 || selectedMonths.includes(idx)
                  ? selectedMonths.includes(idx)
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  : 'bg-gray-50 text-gray-400 border border-gray-100 hover:bg-gray-100 hover:text-gray-600'
              }`}
            >
              {month.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      {/* Year Summary Cards */}
      {filteredData && (
        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-3 xs:gap-4 md:gap-5">
          <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-4 xs:p-5 md:p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 xs:gap-3 md:gap-4">
              <div className="p-2 xs:p-2.5 md:p-3 bg-gradient-to-br from-green-400 to-emerald-500 rounded-lg xs:rounded-xl shadow-lg shadow-green-500/30">
                <BanknotesIcon className="w-5 h-5 xs:w-6 xs:h-6 md:w-7 md:h-7 text-white" />
              </div>
              <div>
                <p className="text-[10px] xs:text-xs md:text-sm text-gray-500 font-medium">Total încasat</p>
                <p className="text-base xs:text-lg md:text-2xl font-bold text-gray-900">
                  {filteredData.yearTotal.totalAmount.toLocaleString('ro-RO')} <span className="text-xs xs:text-sm md:text-lg text-gray-400">MDL</span>
                </p>
              </div>
            </div>
          </div>

          {filteredData.yearTotal.totalDebt > 0 && (
            <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-red-100 p-4 xs:p-5 md:p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 xs:gap-3 md:gap-4">
                <div className="p-2 xs:p-2.5 md:p-3 bg-gradient-to-br from-red-400 to-rose-500 rounded-lg xs:rounded-xl shadow-lg shadow-red-500/30">
                  <BanknotesIcon className="w-5 h-5 xs:w-6 xs:h-6 md:w-7 md:h-7 text-white" />
                </div>
                <div>
                  <p className="text-[10px] xs:text-xs md:text-sm text-gray-500 font-medium">Datorii rămase</p>
                  <p className="text-base xs:text-lg md:text-2xl font-bold text-red-600">
                    {filteredData.yearTotal.totalDebt.toLocaleString('ro-RO')} <span className="text-xs xs:text-sm md:text-lg text-red-300">MDL</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-4 xs:p-5 md:p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 xs:gap-3 md:gap-4">
              <div className="p-2 xs:p-2.5 md:p-3 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-lg xs:rounded-xl shadow-lg shadow-blue-500/30">
                <CalendarIcon className="w-5 h-5 xs:w-6 xs:h-6 md:w-7 md:h-7 text-white" />
              </div>
              <div>
                <p className="text-[10px] xs:text-xs md:text-sm text-gray-500 font-medium">Total plăți</p>
                <p className="text-base xs:text-lg md:text-2xl font-bold text-gray-900">
                  {filteredData.yearTotal.totalPayments}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-4 xs:p-5 md:p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 xs:gap-3 md:gap-4">
              <div className="p-2 xs:p-2.5 md:p-3 bg-gradient-to-br from-purple-400 to-violet-500 rounded-lg xs:rounded-xl shadow-lg shadow-purple-500/30">
                <UsersIcon className="w-5 h-5 xs:w-6 xs:h-6 md:w-7 md:h-7 text-white" />
              </div>
              <div>
                <p className="text-[10px] xs:text-xs md:text-sm text-gray-500 font-medium">Elevi unici</p>
                <p className="text-base xs:text-lg md:text-2xl font-bold text-gray-900">
                  {filteredData.yearTotal.uniqueStudents}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 p-4 xs:p-5 md:p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 xs:gap-3 md:gap-4">
              <div className="p-2 xs:p-2.5 md:p-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg xs:rounded-xl shadow-lg shadow-amber-500/30">
                <ChartBarIcon className="w-5 h-5 xs:w-6 xs:h-6 md:w-7 md:h-7 text-white" />
              </div>
              <div>
                <p className="text-[10px] xs:text-xs md:text-sm text-gray-500 font-medium">Media / plată</p>
                <p className="text-base xs:text-lg md:text-2xl font-bold text-gray-900">
                  {filteredData.yearTotal.totalPayments > 0 
                    ? Math.round(filteredData.yearTotal.totalAmount / filteredData.yearTotal.totalPayments).toLocaleString('ro-RO')
                    : 0} <span className="text-xs xs:text-sm md:text-lg text-gray-400">MDL</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Teacher Stats - Who created payments / profit per teacher */}
      {filteredData?.teacherStats && filteredData.teacherStats.length > 0 && (
        <div className="bg-white rounded-xl xs:rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-3 xs:p-4 md:p-6 border-b border-gray-100">
            <h2 className="text-sm xs:text-base md:text-lg font-bold text-gray-900 flex items-center gap-2">
              <UserGroupIcon className="w-5 h-5 text-indigo-500" />
              Profit adus de profesori
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Plățile înregistrate de fiecare profesor • {selectedMonths.length === 0
                ? `tot anul ${year}`
                : selectedMonths.map(i => MONTHS[i]).join(', ')}
            </p>
          </div>
          <div className="p-3 xs:p-4 md:p-6">
            <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 xs:gap-4">
              {filteredData.teacherStats.map((teacher, idx) => {
                const maxAmount = filteredData.teacherStats[0]?.totalAmount || 1
                const percentage = Math.round((teacher.totalAmount / maxAmount) * 100)
                
                return (
                  <div 
                    key={teacher.id} 
                    className={`relative p-3 xs:p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${
                      selectedTeachers.includes(teacher.id)
                        ? 'border-indigo-300 bg-indigo-50'
                        : 'border-gray-200 hover:border-indigo-200'
                    }`}
                    onClick={() => toggleTeacher(teacher.id)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                        idx === 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-500' :
                        idx === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400' :
                        idx === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700' :
                        'bg-gradient-to-br from-indigo-400 to-purple-500'
                      }`}>
                        {idx < 3 ? idx + 1 : teacher.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 text-sm truncate">{teacher.name}</p>
                        <p className="text-xs text-gray-500">{teacher.totalPayments} plăți</p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-lg font-bold text-emerald-600">{teacher.totalAmount.toLocaleString('ro-RO')}</span>
                        <span className="text-xs text-gray-400">MDL</span>
                      </div>
                      <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-emerald-400 to-green-500 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                    {selectedTeachers.includes(teacher.id) && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Monthly Breakdown - Visual Cards */}
      {loading ? (
        <div className="bg-white rounded-2xl xs:rounded-3xl shadow-sm border border-gray-100 p-8 xs:p-12 md:p-16 text-center">
          <div className="relative w-12 h-12 xs:w-16 xs:h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-green-200"></div>
            <div className="absolute inset-0 rounded-full border-4 border-green-500 border-t-transparent animate-spin"></div>
          </div>
          <p className="text-gray-500 mt-4 xs:mt-6 font-medium text-sm xs:text-base">Se încarcă datele...</p>
        </div>
      ) : filteredData ? (
        <div className="bg-white rounded-2xl xs:rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-3 xs:p-4 md:p-6 border-b border-gray-100">
            <h2 className="text-sm xs:text-base md:text-lg font-bold text-gray-900 flex items-center gap-1 xs:gap-2 flex-wrap">
              <CalendarIcon className="w-4 h-4 xs:w-5 xs:h-5 text-gray-400" />
              <span>Încasări lunare {year}</span>
              {selectedMonths.length > 0 && (
                <span className="text-[10px] xs:text-xs md:text-sm font-medium px-2 xs:px-3 py-0.5 xs:py-1 rounded-full bg-emerald-100 text-emerald-700">
                  {selectedMonths.length} {selectedMonths.length === 1 ? 'lună' : 'luni'}
                </span>
              )}
              {paymentMethodFilter !== 'all' && (
                <span className={`text-[10px] xs:text-xs md:text-sm font-medium px-2 xs:px-3 py-0.5 xs:py-1 rounded-full ${
                  paymentMethodFilter === 'cash' ? 'bg-green-100 text-green-700' :
                  paymentMethodFilter === 'card' ? 'bg-blue-100 text-blue-700' :
                  paymentMethodFilter === 'card-transfer' ? 'bg-indigo-100 text-indigo-700' :
                  'bg-purple-100 text-purple-700'
                }`}>
                  {paymentMethodFilter === 'cash' ? '💵 Numerar' : 
                   paymentMethodFilter === 'card' ? '💳 Card' : 
                   paymentMethodFilter === 'card-transfer' ? '💳🏦 Card/Transfer' :
                   '🏦 Transfer'}
                </span>
              )}
            </h2>
          </div>
          
          <div className="divide-y divide-gray-100">
            {filteredData.months.map((month, idx) => {
              // Skip filtered out months
              if (month.filtered) return null
              
              return (
              <Fragment key={month.month}>
                <div 
                  className={`p-3 xs:p-4 md:p-5 hover:bg-gray-50 transition-colors ${
                    year === new Date().getFullYear() && idx === currentMonth ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-l-green-500' : ''
                  } ${month.totalAmount === 0 ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2 xs:gap-3">
                    <div className="flex items-center gap-2 xs:gap-3 md:gap-4 min-w-0 flex-1">
                      <div className={`w-9 h-9 xs:w-10 xs:h-10 md:w-12 md:h-12 rounded-lg xs:rounded-xl flex items-center justify-center text-sm xs:text-base md:text-lg font-bold flex-shrink-0 ${
                        month.totalAmount > 0 
                          ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white shadow-lg shadow-green-500/20' 
                          : 'bg-gray-100 text-gray-400'
                      }`}>
                        {month.month.slice(0, 3)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`font-semibold text-xs xs:text-sm md:text-base truncate ${
                          year === new Date().getFullYear() && idx === currentMonth ? 'text-green-700' : 'text-gray-900'
                        }`}>
                          {month.month}
                          {year === new Date().getFullYear() && idx === currentMonth && (
                            <span className="ml-1 xs:ml-2 text-[9px] xs:text-xs bg-green-500 text-white px-1.5 xs:px-2 py-0.5 rounded-full">
                              Curent
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] xs:text-xs md:text-sm text-gray-500 truncate">
                          {month.totalPayments} {month.totalPayments === 1 ? 'plată' : 'plăți'} • {month.uniqueStudents} {month.uniqueStudents === 1 ? 'elev' : 'elevi'}
                        </p>
                      </div>
                    </div>

                    {/* Visual Bar - Hidden on mobile */}
                    <div className="flex-1 mx-4 hidden lg:block">
                      <div className="h-8 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-500 flex items-center justify-end pr-3"
                          style={{ width: `${Math.max((month.totalAmount / maxMonthAmount) * 100, month.totalAmount > 0 ? 5 : 0)}%` }}
                        >
                          {month.totalAmount > 0 && (month.totalAmount / maxMonthAmount) > 0.15 && (
                            <span className="text-xs font-semibold text-white whitespace-nowrap">
                              {month.totalAmount.toLocaleString('ro-RO')} MDL
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 xs:gap-3 md:gap-4 flex-shrink-0">
                      <div className="text-right">
                        <p className={`text-sm xs:text-base md:text-xl font-bold ${month.totalAmount > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                          {month.totalAmount.toLocaleString('ro-RO')}
                          <span className="text-[10px] xs:text-xs md:text-sm font-normal text-gray-400 ml-0.5 xs:ml-1">MDL</span>
                        </p>
                      </div>
                      
                      {month.payments.length > 0 && (
                        <button
                          onClick={() => setExpandedMonth(expandedMonth === idx ? null : idx)}
                          className={`p-1.5 xs:p-2 rounded-lg xs:rounded-xl transition-all ${
                            expandedMonth === idx 
                              ? 'bg-green-100 text-green-600' 
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {expandedMonth === idx ? (
                            <ChevronUpIcon className="w-4 h-4 xs:w-5 xs:h-5" />
                          ) : (
                            <ChevronDownIcon className="w-4 h-4 xs:w-5 xs:h-5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedMonth === idx && month.payments.length > 0 && (
                    <div className="mt-3 xs:mt-4 md:mt-5 pt-3 xs:pt-4 md:pt-5 border-t border-gray-100">
                      <div className="grid gap-2 xs:gap-3 max-h-64 xs:max-h-80 md:max-h-96 overflow-y-auto pr-1 xs:pr-2">
                        {month.payments.map((payment) => (
                          <div key={payment.id} className="flex items-center justify-between bg-gray-50 rounded-lg xs:rounded-xl p-2.5 xs:p-3 md:p-4 hover:bg-gray-100 transition-colors gap-2">
                            <div className="flex items-center gap-2 xs:gap-3 md:gap-4 min-w-0 flex-1">
                              <div className="w-8 h-8 xs:w-9 xs:h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold text-xs xs:text-sm shadow-lg shadow-green-500/20 flex-shrink-0">
                                {payment.studentName.charAt(0)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-gray-900 text-xs xs:text-sm md:text-base truncate">{payment.studentName}</p>
                                <p className="text-[10px] xs:text-xs md:text-sm text-gray-500 truncate">{payment.groupName}</p>
                              </div>
                            </div>
                            
                            <div className="flex flex-col xs:flex-row items-end xs:items-center gap-1 xs:gap-2 md:gap-4 flex-shrink-0">
                              {payment.source === 'app' ? (
                                <span className="inline-flex items-center gap-1 xs:gap-1.5 px-2 xs:px-2.5 md:px-3 py-1 xs:py-1.5 rounded-md xs:rounded-lg text-[10px] xs:text-xs md:text-sm font-medium bg-blue-100 text-blue-700">
                                  <span className="text-xs xs:text-sm">📱</span>
                                  <span className="hidden xs:inline">Aplicație</span>
                                </span>
                              ) : (
                                <span className={`inline-flex items-center gap-1 xs:gap-1.5 px-2 xs:px-2.5 md:px-3 py-1 xs:py-1.5 rounded-md xs:rounded-lg text-[10px] xs:text-xs md:text-sm font-medium ${
                                  payment.paymentMethod === 'cash' 
                                    ? 'bg-green-100 text-green-700' 
                                    : payment.paymentMethod === 'card' 
                                    ? 'bg-blue-100 text-blue-700' 
                                    : 'bg-purple-100 text-purple-700'
                                }`}>
                                  <span className="text-xs xs:text-sm">{payment.paymentMethod === 'cash' ? '💵' : payment.paymentMethod === 'card' ? '💳' : '🏦'}</span>
                                  <span className="hidden xs:inline">{payment.paymentMethod === 'cash' ? 'Numerar' : payment.paymentMethod === 'card' ? 'Card' : 'Transfer'}</span>
                                </span>
                              )}
                              
                              {payment.source === 'app' && payment.validDays && (
                                <span className="inline-flex items-center px-1.5 xs:px-2 py-0.5 xs:py-1 bg-indigo-100 text-indigo-700 rounded-md xs:rounded-lg text-[10px] xs:text-xs md:text-sm font-medium whitespace-nowrap">
                                  {payment.validDays} zile
                                </span>
                              )}
                              
                              {payment.source !== 'app' && payment.lessonsAdded && (
                                <span className="inline-flex items-center px-1.5 xs:px-2 py-0.5 xs:py-1 bg-indigo-100 text-indigo-700 rounded-md xs:rounded-lg text-[10px] xs:text-xs md:text-sm font-medium whitespace-nowrap">
                                  +{payment.lessonsAdded} lecții
                                </span>
                              )}
                              
                              <div className="text-right min-w-[60px] xs:min-w-[80px] md:min-w-[100px]">
                                <p className="font-bold text-green-600 text-xs xs:text-sm md:text-base whitespace-nowrap">{payment.amount.toLocaleString('ro-RO')} MDL</p>
                                <p className="text-[9px] xs:text-[10px] md:text-xs text-gray-400">
                                  {new Date(payment.paymentDate).toLocaleDateString('ro-RO', {
                                    day: '2-digit',
                                    month: 'short'
                                  })}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Fragment>
            )})}
          </div>

          {/* Year Total Footer */}
          <div className="p-4 xs:p-5 md:p-6 bg-gradient-to-r from-gray-900 to-gray-800 text-white">
            <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-3 xs:gap-4">
              <div className="flex items-center gap-2 xs:gap-3">
                <div className="p-2 xs:p-2.5 md:p-3 bg-white/10 rounded-lg xs:rounded-xl">
                  <CurrencyDollarIcon className="w-5 h-5 xs:w-6 xs:h-6" />
                </div>
                <div>
                  <span className="text-sm xs:text-base md:text-lg font-bold">TOTAL {year}</span>
                  {paymentMethodFilter !== 'all' && (
                    <span className="block xs:inline xs:ml-2 text-xs xs:text-sm text-gray-400">
                      ({paymentMethodFilter === 'cash' ? 'Numerar' : 
                        paymentMethodFilter === 'card' ? 'Card' : 
                        paymentMethodFilter === 'card-transfer' ? 'Card/Transfer' :
                        'Transfer'})
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 xs:gap-4 md:gap-8 w-full xs:w-auto justify-between xs:justify-end">
                <div className="text-center">
                  <p className="text-gray-400 text-[10px] xs:text-xs md:text-sm">Plăți</p>
                  <p className="text-base xs:text-lg md:text-xl font-bold">{filteredData.yearTotal.totalPayments}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-400 text-[10px] xs:text-xs md:text-sm">Elevi</p>
                  <p className="text-base xs:text-lg md:text-xl font-bold">{filteredData.yearTotal.uniqueStudents}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-400 text-[10px] xs:text-xs md:text-sm">Total încasat</p>
                  <p className="text-lg xs:text-xl md:text-2xl font-bold text-green-400">
                    {filteredData.yearTotal.totalAmount.toLocaleString('ro-RO')} MDL
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl xs:rounded-3xl shadow-sm border border-gray-100 p-8 xs:p-12 md:p-16 text-center">
          <div className="w-12 h-12 xs:w-16 xs:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 xs:mb-4">
            <BanknotesIcon className="w-6 h-6 xs:w-8 xs:h-8 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium text-sm xs:text-base">Nu există date pentru anul selectat.</p>
        </div>
      )}

      {/* Quick Stats Cards */}
      {filteredData && filteredData.yearTotal.totalPayments > 0 && (
        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-3 xs:gap-4 md:gap-5">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl xs:rounded-2xl p-4 xs:p-5 md:p-6 text-white shadow-xl shadow-indigo-500/20">
            <div className="flex items-center gap-2 xs:gap-3 mb-2 xs:mb-3">
              <div className="p-1.5 xs:p-2 bg-white/20 rounded-md xs:rounded-lg">
                <CalendarIcon className="w-4 h-4 xs:w-5 xs:h-5" />
              </div>
              <span className="font-medium text-indigo-200 text-xs xs:text-sm md:text-base">Media lunară</span>
            </div>
            <p className="text-xl xs:text-2xl md:text-3xl font-bold">
              {Math.round(filteredData.yearTotal.totalAmount / 12).toLocaleString('ro-RO')}
              <span className="text-sm xs:text-base md:text-lg font-normal text-indigo-200 ml-1">MDL</span>
            </p>
          </div>

          <div className="bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl xs:rounded-2xl p-4 xs:p-5 md:p-6 text-white shadow-xl shadow-pink-500/20">
            <div className="flex items-center gap-2 xs:gap-3 mb-2 xs:mb-3">
              <div className="p-1.5 xs:p-2 bg-white/20 rounded-md xs:rounded-lg">
                <BanknotesIcon className="w-4 h-4 xs:w-5 xs:h-5" />
              </div>
              <span className="font-medium text-pink-200 text-xs xs:text-sm md:text-base">Media per plată</span>
            </div>
            <p className="text-xl xs:text-2xl md:text-3xl font-bold">
              {Math.round(filteredData.yearTotal.totalAmount / filteredData.yearTotal.totalPayments).toLocaleString('ro-RO')}
              <span className="text-sm xs:text-base md:text-lg font-normal text-pink-200 ml-1">MDL</span>
            </p>
          </div>

          <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl xs:rounded-2xl p-4 xs:p-5 md:p-6 text-white shadow-xl shadow-amber-500/20 xs:col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 xs:gap-3 mb-2 xs:mb-3">
              <div className="p-1.5 xs:p-2 bg-white/20 rounded-md xs:rounded-lg">
                <UsersIcon className="w-4 h-4 xs:w-5 xs:h-5" />
              </div>
              <span className="font-medium text-amber-200 text-xs xs:text-sm md:text-base">Media per elev</span>
            </div>
            <p className="text-xl xs:text-2xl md:text-3xl font-bold">
              {filteredData.yearTotal.uniqueStudents > 0 
                ? Math.round(filteredData.yearTotal.totalAmount / filteredData.yearTotal.uniqueStudents).toLocaleString('ro-RO')
                : 0}
              <span className="text-sm xs:text-base md:text-lg font-normal text-amber-200 ml-1">MDL</span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
