'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { usePermissions } from '@/hooks/usePermissions'
import { BarChart, AreaChart, DonutChart, RankBars, Funnel, CHART_COLORS } from '@/components/admin/ads/AdCharts'
import { RATINGS } from '@/lib/ads-rating'
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline'

const MONTH_NAMES = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

const shortMonth = (key) => {
  const [y, m] = (key || '').split('-')
  const idx = parseInt(m, 10) - 1
  return MONTH_NAMES[idx] ? `${MONTH_NAMES[idx].slice(0, 3)} ${y.slice(2)}` : key
}

const monthLabel = (key) => {
  const [y, m] = (key || '').split('-')
  const idx = parseInt(m, 10) - 1
  return MONTH_NAMES[idx] ? `${MONTH_NAMES[idx]} ${y}` : key
}

const money = (v, currency) =>
  v == null
    ? '—'
    : `${Number(v).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || ''}`.trim()

const int = (v) => Number(v || 0).toLocaleString('ro-RO')

const STATUS_LABELS = {
  ACTIVE: { label: 'activă', color: 'bg-emerald-100 text-emerald-800' },
  PAUSED: { label: 'pe pauză', color: 'bg-amber-100 text-amber-800' },
  ARCHIVED: { label: 'arhivată', color: 'bg-gray-100 text-gray-600' },
  DELETED: { label: 'ștearsă', color: 'bg-red-100 text-red-700' },
}

const relativeTime = (iso) => {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'chiar acum'
  if (min < 60) return `acum ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `acum ${h} ${h === 1 ? 'oră' : 'ore'}`
  return new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const ADS_CACHE_KEY = 'pischool:ads:v1'

export default function AdsClient() {
  const router = useRouter()
  const { hasPermission, isSuperAdmin } = usePermissions()

  // Ultimele date citite rămân în browser: la o revenire pe pagină apar
  // instant, fără ecran de încărcare, chiar dacă nu s-a dat actualizare.
  const cached = (() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = sessionStorage.getItem(ADS_CACHE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })()

  const [data, setData] = useState(cached)
  const [loading, setLoading] = useState(!cached)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [openAccount, setOpenAccount] = useState(null)
  const [showMonths, setShowMonths] = useState(true)

  useEffect(() => {
    if (!hasPermission('ads.view') && !isSuperAdmin) router.push('/admin')
  }, [hasPermission, isSuperAdmin, router])

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true)
    try {
      const res = await fetch(`/api/admin/ads${refresh ? '?refresh=1' : ''}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.hint || json.error || 'Eroare la citirea datelor')
      setData(json)
      setError(null)
      try { sessionStorage.setItem(ADS_CACHE_KEY, JSON.stringify(json)) } catch {}
      if (refresh) toast.success('Datele au fost actualizate din Meta')
    } catch (err) {
      setError(err.message)
      if (refresh) toast.error(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Cu ceva deja pe ecran, cererea din fundal doar completează —
  // altfel arătăm ecranul de încărcare până vine primul răspuns.
  useEffect(() => { load(false) }, [load])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    )
  }

  const currency = data?.currency || ''
  const t = data?.totals

  // Lunile vin descrescător de la API; graficele le vor în ordine cronologică
  const months = [...(data?.monthly || [])].reverse().map((m) => ({
    ...m,
    label: monthLabel(m.month),
    short: shortMonth(m.month),
  }))

  const byAccount = (data?.accounts || [])
    .map((a, i) => ({ label: a.name, value: a.totals.spend, color: CHART_COLORS[i % CHART_COLORS.length] }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)

  const topCampaigns = (data?.accounts || [])
    .flatMap((a) => a.campaigns.map((c) => ({
      label: c.name,
      value: c.stats.spend,
      hint: [
        c.stats.messages ? `${int(c.stats.messages)} mesaje` : null,
        c.stats.leads ? `${int(c.stats.leads)} lead-uri` : null,
        c.stats.costPerMessage ? `${money(c.stats.costPerMessage, a.currency)} / mesaj` : null,
      ].filter(Boolean).join(' · ') || null,
    })))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  const funnelSteps = t ? [
    { label: 'Afișări', value: t.impressions, color: '#6366f1' },
    { label: 'Clicuri pe link', value: t.linkClicks || t.clicks, color: '#06b6d4' },
    { label: 'Conversații pornite', value: t.messages, color: '#10b981' },
    { label: 'Au răspuns', value: t.replies || 0, color: '#f59e0b' },
    { label: 'Lead-uri', value: t.leads, color: '#ec4899' },
  ].filter((s, i) => i === 0 || s.value > 0) : []

  return (
    <div className="space-y-4 xs:space-y-6">
      {/* Antet */}
      <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3">
        <div>
          <h1 className="text-xl xs:text-2xl font-bold text-gray-900">Reclame</h1>
          <p className="text-sm xs:text-base text-gray-600">
            {data?.filteredByPages?.length > 0
              ? `Reclamele Meta pentru ${data.filteredByPages.map((p) => p.name).join(', ')}`
              : 'Tot ce s-a cheltuit și ce a ieșit din reclamele Meta (Facebook & Instagram)'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {data?.fetchedAt && (
            <span className="text-xs text-gray-500">
              actualizat {relativeTime(data.cached ? data.cachedAt || data.fetchedAt : data.fetchedAt)}
            </span>
          )}
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Se actualizează…' : 'Actualizează'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Nu s-au putut citi datele din Meta</p>
            <p className="text-sm text-red-700 mt-0.5">{error}</p>
            {data?.accounts?.length > 0 && (
              <p className="text-xs text-red-600 mt-1">Mai jos sunt datele de la ultima citire reușită.</p>
            )}
          </div>
        </div>
      )}

      {data?.warnings?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="font-medium text-amber-800 text-sm">Câteva date lipsesc:</p>
          <ul className="mt-1 text-sm text-amber-700 list-disc list-inside space-y-0.5">
            {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {!error && data && data.accounts.length === 0 && !data.filteredByPages?.length && (
        <p className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500 text-center">
          Token-ul curent nu are acces la niciun cont de reclame.
        </p>
      )}

      {!error && data && data.accounts.length === 0 && data.filteredByPages?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 xs:p-10 text-center">
          <p className="text-4xl mb-3">📣</p>
          <p className="font-semibold text-gray-900">
            Nicio campanie pentru {data.filteredByPages.map((p) => p.name).join(', ')}
          </p>
          <p className="text-sm text-gray-600 mt-1 max-w-xl mx-auto">
            Contul Meta conectat ({data.user?.name || '—'}) nu are acces la niciun cont de reclame
            care să promoveze această pagină. Adaugă contul de reclame al școlii la acest
            utilizator în Meta Business Manager — cifrele apar aici singure, fără altă setare.
          </p>

          {/* Linkurile duc fix unde e de lucru, ca să nu se caute prin meniuri */}
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <MetaLink href={`https://business.facebook.com/latest/ad_center/all_ads?asset_id=${data.filteredByPages[0].id}`}>
              Reclamele paginii
            </MetaLink>
            <MetaLink href="https://adsmanager.facebook.com/adsmanager/manage/accounts">
              Conturile mele de reclame
            </MetaLink>
            <MetaLink href="https://business.facebook.com/settings/ad-accounts">
              Setări → Conturi de reclame
            </MetaLink>
          </div>
        </div>
      )}

      {data && data.accounts.length > 0 && (
        <>
          {/* Totaluri */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Cheltuit total" value={money(t.spend, currency)} tone="indigo" />
            <Stat label="Mesaje pornite" value={int(t.messages)} hint={t.costPerMessage ? `${money(t.costPerMessage, currency)} / mesaj` : null} tone="emerald" />
            <Stat label="Lead-uri" value={int(t.leads)} hint={t.costPerLead ? `${money(t.costPerLead, currency)} / lead` : null} tone="amber" />
            <Stat label="Afișări" value={int(t.impressions)} hint={`${int(t.reach)} persoane`} tone="neutral" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Clicuri" value={int(t.clicks)} hint={`${int(t.linkClicks)} pe link`} tone="neutral" />
            <Stat label="CTR" value={`${t.ctr.toFixed(2)}%`} tone="neutral" />
            <Stat label="Cost pe clic" value={money(t.cpc, currency)} tone="neutral" />
            <Stat label="Conturi de reclame" value={int(data.accounts.length)} hint={data.currencies?.length > 1 ? `monede: ${data.currencies.join(', ')}` : null} tone="neutral" />
          </div>

          {/* Cât de bine merg reclamele */}
          {data.rating?.rated > 0 && (
            <Card title="Cât de bine merg campaniile">
              <div className="flex flex-wrap gap-2 mb-3">
                {['excellent', 'good', 'average', 'poor'].map((level) => (
                  data.rating.counts[level] > 0 && (
                    <span
                      key={level}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${RATINGS[level].color}`}
                    >
                      {data.rating.counts[level]} {RATINGS[level].label.toLowerCase()}
                    </span>
                  )
                ))}
                {data.rating.counts.unknown > 0 && (
                  <span className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-500">
                    {data.rating.counts.unknown} fără destule date
                  </span>
                )}
              </div>

              <div className="space-y-1.5 text-sm text-gray-700">
                {data.rating.bestCampaign && (
                  <p>
                    🥇 Cel mai bine merge <b>{data.rating.bestCampaign.name}</b>:{' '}
                    {money(data.rating.bestCampaign.cost, currency)} pe rezultat,{' '}
                    {int(data.rating.bestCampaign.results)} rezultate.
                  </p>
                )}
                {data.rating.worstCampaign &&
                  data.rating.worstCampaign.name !== data.rating.bestCampaign?.name && (
                  <p>
                    🐌 Cel mai scump: <b>{data.rating.worstCampaign.name}</b>,{' '}
                    {money(data.rating.worstCampaign.cost, currency)} pe rezultat.
                  </p>
                )}
                {data.rating.wastedSpend > 0 && (
                  <p className="text-red-700">
                    ⚠️ Campaniile slabe au consumat {money(data.rating.wastedSpend, currency)}.
                  </p>
                )}
              </div>

              <p className="text-[11px] text-gray-500 mt-3">
                „Rezultat" înseamnă o conversație pornită sau un lead — ce aduce oameni, nu
                afișări. Fiecare campanie se compară cu mediana campaniilor voastre, nu cu un
                prag inventat: jumătate ies mai bune, jumătate mai slabe. Sub 5 {currency} cheltuiți
                nu tragem concluzii.
              </p>
            </Card>
          )}

          {/* Grafice */}
          <div className="grid lg:grid-cols-3 gap-3">
            <Card title="Cheltuieli lună de lună" className="lg:col-span-2">
              <BarChart
                rows={months}
                series={[{ key: 'spend', label: `Cheltuit (${currency || 'valută'})`, color: '#6366f1' }]}
                formatValue={(v) => Number(v).toLocaleString('ro-RO', { maximumFractionDigits: 0 })}
              />
            </Card>

            <Card title="Bugetul, pe conturi">
              <DonutChart
                slices={byAccount}
                centerLabel="Total"
                centerValue={money(t.spend, currency)}
                formatValue={(v) => money(v, currency)}
              />
            </Card>

            <Card title="Rezultate lună de lună" className="lg:col-span-2">
              <AreaChart
                rows={months}
                series={[
                  { key: 'messages', label: 'Conversații pornite', color: '#10b981' },
                  { key: 'leads', label: 'Lead-uri', color: '#ec4899' },
                ]}
                formatValue={(v) => Math.round(v)}
              />
            </Card>

            <Card title="De la afișare la lead">
              <Funnel steps={funnelSteps} formatValue={(v) => int(v)} />
            </Card>

            <Card title="Top campanii după buget" className="lg:col-span-3">
              <RankBars rows={topCampaigns} formatValue={(v) => money(v, currency)} />
            </Card>
          </div>

          {/* Conturi */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">Conturi de reclame</h2>

            {data.accounts.length === 0 ? (
              <p className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500 text-center">
                Token-ul curent nu are acces la niciun cont de reclame.
              </p>
            ) : (
              data.accounts.map((a) => {
                const open = openAccount === a.id
                const pages = a.promotedPageIds
                  .map((id) => data.pages.find((p) => p.id === id)?.name || id)
                return (
                  <div key={a.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenAccount(open ? null : a.id)}
                      className="w-full flex flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 flex flex-wrap items-center gap-2">
                          {a.name}
                          <span className="text-[11px] font-normal text-gray-400">{a.accountId}</span>
                          {a.status !== 1 && (
                            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-medium">
                              cont inactiv
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {pages.length > 0 ? `promovează: ${pages.join(', ')}` : 'nicio pagină identificată'}
                          {a.createdTime ? ` · din ${new Date(a.createdTime).toLocaleDateString('ro-RO')}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Cheltuit</p>
                          <p className="font-bold text-gray-900">{money(a.totals.spend, a.currency)}</p>
                        </div>
                        <div className="hidden sm:block">
                          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Mesaje</p>
                          <p className="font-bold text-emerald-600">{int(a.totals.messages)}</p>
                        </div>
                        <div className="hidden sm:block">
                          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Lead-uri</p>
                          <p className="font-bold text-amber-600">{int(a.totals.leads)}</p>
                        </div>
                        {open ? <ChevronUpIcon className="h-5 w-5 text-gray-400" /> : <ChevronDownIcon className="h-5 w-5 text-gray-400" />}
                      </div>
                    </button>

                    {open && (
                      <div className="border-t border-gray-100 p-4 space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <MiniStat label="Afișări" value={int(a.totals.impressions)} />
                          <MiniStat label="Persoane" value={int(a.totals.reach)} />
                          <MiniStat label="Clicuri" value={int(a.totals.clicks)} />
                          <MiniStat label="CPC" value={money(a.totals.cpc, a.currency)} />
                        </div>

                        <div>
                          <h3 className="text-sm font-bold text-gray-900 mb-2">
                            Campanii
                            <span className="ml-1.5 text-xs font-normal text-gray-500">
                              {a.campaigns.length} în total
                            </span>
                          </h3>
                          {a.campaigns.length === 0 ? (
                            <p className="text-sm text-gray-500">Nicio campanie.</p>
                          ) : (
                            <div className="overflow-x-auto border border-gray-100 rounded-lg">
                              <table className="min-w-full text-sm">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <Th>Campanie</Th>
                                    <Th center>Status</Th>
                                    <Th right>Cheltuit</Th>
                                    <Th right>Mesaje</Th>
                                    <Th right>Lead-uri</Th>
                                    <Th right>Afișări</Th>
                                    <Th right>Clicuri</Th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {a.campaigns.map((c) => {
                                    const st = STATUS_LABELS[c.status] || { label: c.status, color: 'bg-gray-100 text-gray-600' }
                                    return (
                                      <tr key={c.id} className="hover:bg-gray-50">
                                        <td className="px-3 py-2">
                                          <p className="font-medium text-gray-900 flex flex-wrap items-center gap-1.5">
                                            {c.name}
                                            {c.rating && (
                                              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${c.rating.color}`}>
                                                {c.rating.label}
                                              </span>
                                            )}
                                          </p>
                                          <p className="text-[11px] text-gray-500">
                                            {c.rating?.reason || c.objective || '—'}
                                            {c.createdTime ? ` · ${new Date(c.createdTime).toLocaleDateString('ro-RO')}` : ''}
                                          </p>
                                        </td>
                                        <td className="px-3 py-2 text-center whitespace-nowrap">
                                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${st.color}`}>
                                            {st.label}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">
                                          {money(c.stats.spend, a.currency)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-emerald-600 font-medium">{int(c.stats.messages)}</td>
                                        <td className="px-3 py-2 text-right text-amber-600 font-medium">{int(c.stats.leads)}</td>
                                        <td className="px-3 py-2 text-right text-gray-600">{int(c.stats.impressions)}</td>
                                        <td className="px-3 py-2 text-right text-gray-600">{int(c.stats.clicks)}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Lună de lună */}
          {data.monthly.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowMonths((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm font-semibold text-gray-900">
                  Lună de lună
                  <span className="ml-1.5 font-normal text-gray-500">{data.monthly.length} luni</span>
                </span>
                {showMonths ? <ChevronUpIcon className="h-5 w-5 text-gray-400" /> : <ChevronDownIcon className="h-5 w-5 text-gray-400" />}
              </button>

              {showMonths && (
                <div className="overflow-x-auto border-t border-gray-100">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <Th>Luna</Th>
                        <Th right>Cheltuit</Th>
                        <Th right>Mesaje</Th>
                        <Th right>Lead-uri</Th>
                        <Th right>Afișări</Th>
                        <Th right>Clicuri</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.monthly.map((m) => (
                        <tr key={m.month} className="hover:bg-gray-50">
                          <td className="px-3 py-2 capitalize text-gray-900">{monthLabel(m.month)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">
                            {money(m.spend, currency)}
                          </td>
                          <td className="px-3 py-2 text-right text-emerald-600 font-medium">{int(m.messages)}</td>
                          <td className="px-3 py-2 text-right text-amber-600 font-medium">{int(m.leads)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{int(m.impressions)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{int(m.clicks)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Conexiunea */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-bold text-gray-900 mb-2">Conexiunea cu Meta</h2>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <Row label="Cont Meta" value={data.user?.name || '—'} />
              {data.pages?.length > 0 && (
                <Row label="Pagina" value={data.pages.map((p) => p.name).join(', ')} />
              )}
              <Row
                label="Meta cere reînnoirea accesului până la"
                value={data.token?.dataAccessExpiresAt
                  ? new Date(data.token.dataAccessExpiresAt).toLocaleDateString('ro-RO')
                  : '—'}
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-3">
              Datele se păstrează în CRM și se împrospătează singure în fundal, ca pagina să
              se deschidă imediat; butonul „Actualizează" le cere de la Meta pe loc.
              {data.windowSince && (
                <> Meta nu dă statistici mai vechi de 37 de luni, așa că cifrele pornesc din{' '}
                  <b>{new Date(data.windowSince).toLocaleDateString('ro-RO')}</b>.</>
              )}
              {data.token?.dataAccessExpiresAt && (
                <> Data de mai sus e regula Meta de 90 de zile pentru token-uri de utilizator:
                  atunci trebuie regenerat. Un token de „system user" din Business Manager nu
                  expiră și scapă de grija asta.</>
              )}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function MetaLink({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-indigo-700 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
    >
      {children}
      <span aria-hidden className="text-gray-400">↗</span>
    </a>
  )
}

function Card({ title, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 ${className}`}>
      <h2 className="text-sm font-bold text-gray-900 mb-3">{title}</h2>
      {children}
    </div>
  )
}

function Stat({ label, value, hint, tone = 'neutral' }) {
  const tones = {
    indigo: 'text-indigo-600',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    neutral: 'text-gray-900',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 xs:p-4">
      <p className="text-[10px] xs:text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg xs:text-2xl font-bold ${tones[tone]}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 p-2 text-center">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-bold text-gray-900">{value}</p>
    </div>
  )
}

function Th({ children, right, center }) {
  return (
    <th className={`px-3 py-2 text-xs font-medium text-gray-500 uppercase whitespace-nowrap ${
      right ? 'text-right' : center ? 'text-center' : 'text-left'
    }`}>
      {children}
    </th>
  )
}

function Row({ label, value }) {
  return (
    <p className="flex gap-2">
      <span className="text-gray-500 min-w-[9rem]">{label}:</span>
      <span className="text-gray-900 font-medium break-words">{value}</span>
    </p>
  )
}
