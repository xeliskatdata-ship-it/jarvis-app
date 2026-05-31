import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Brain, Cpu, AlertCircle,
  ChevronLeft, Zap, Activity, Users, AlertTriangle,
  RefreshCw, TrendingUp, Server, Check, Eye,
  Copy, ChevronDown, ChevronUp, CheckCircle2, ArrowUpRight
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const REFRESH_MS = 30000

// IDs admin : Kat (1), Brice (2). Aligne avec le backend (Admin IDs : [1, 2]).
const ADMIN_IDS = [1, 2]

// V2.6 : onglet Persona retire (decision UX : ne pas exposer le system prompt en UI).
// L'endpoint backend /admin/persona reste dispo pour debug curl + reactivation eventuelle.
const TABS = [
  { id: 'monitoring', label: 'Monitoring',           icon: LayoutDashboard, active: true  },
  { id: 'errors',     label: 'Erreurs',              icon: AlertCircle,     active: true  },
  { id: 'memories',   label: 'Memoires & Reflexions',icon: Brain,           active: false },
]

export default function AdminInterface({ auth, onLogout }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('monitoring')
  const [usage, setUsage] = useState(null)
  const [plans, setPlans] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastFetch, setLastFetch] = useState(null)

  useEffect(() => {
    if (!ADMIN_IDS.includes(auth?.user?.id)) {
      navigate('/', { replace: true })
    }
  }, [auth, navigate])

  useEffect(() => {
    let cancelled = false

    const fetchUsage = async () => {
      try {
        const res = await fetch(`${API_URL}/admin/usage`, {
          headers: { 'Authorization': `Bearer ${auth.token}` }
        })
        if (res.status === 401) { onLogout(); return }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          setUsage(data)
          setError(null)
          setLastFetch(new Date())
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchUsage()
    const intervalId = setInterval(fetchUsage, REFRESH_MS)
    return () => { cancelled = true; clearInterval(intervalId) }
  }, [auth.token, onLogout])

  // Fetch /admin/plans une fois au mount (config statique)
  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/admin/plans`, {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setPlans(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [auth.token])

  if (!ADMIN_IDS.includes(auth?.user?.id)) return null

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8ec] flex font-sans-pro">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-sans-pro { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }

        @keyframes skeleton-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.7; } }
        .skeleton { animation: skeleton-pulse 1.5s ease-in-out infinite; }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }

        @keyframes pulse-red { 0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.3); } 50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); } }
        .pulse-red { animation: pulse-red 2s ease-in-out infinite; }
      `}</style>

      <aside className="w-60 bg-[#0e0e14] border-r border-white/5 flex flex-col">
        <div className="px-5 py-5 border-b border-white/5">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-[#6b6b78] hover:text-[#5b9eff] text-xs uppercase tracking-wider transition-colors"
          >
            <ChevronLeft size={14} strokeWidth={2} />
            <span>Retour au chat</span>
          </Link>
        </div>

        <nav className="p-3 flex-1">
          {TABS.map(t => {
            const Icon = t.icon
            const isActive = tab === t.id
            const isClickable = t.active
            return (
              <button
                key={t.id}
                onClick={() => isClickable && setTab(t.id)}
                disabled={!isClickable && !isActive}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all mb-1
                  ${isActive
                    ? 'bg-[#5b9eff]/10 text-[#5b9eff] border border-[#5b9eff]/20'
                    : isClickable
                      ? 'text-[#a0a0a8] hover:bg-white/5 hover:text-[#e8e8ec] border border-transparent'
                      : 'text-[#4a4a52] cursor-not-allowed border border-transparent'}`}
              >
                <Icon size={16} strokeWidth={1.8} />
                <span className="flex-1 text-left">{t.label}</span>
                {!isClickable && (
                  <span className="text-[10px] uppercase tracking-wider opacity-60">Soon</span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="px-5 py-4 border-t border-white/5 text-xs text-[#6b6b78]">
          <div className="font-medium text-[#a0a0a8]">{auth.user.name}</div>
          <div className="opacity-70 mt-0.5">Administrateur</div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <header className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {TABS.find(t => t.id === tab)?.label}
            </h1>
            <p className="text-sm text-[#6b6b78] mt-1">Surveillance temps reel de Wall-E</p>
          </div>

          {(tab === 'monitoring' || tab === 'errors') && lastFetch && (
            <div className="text-xs text-[#6b6b78] flex items-center gap-2 font-mono">
              <RefreshCw size={12} className={loading ? 'spin' : ''} />
              <span>maj {lastFetch.toLocaleTimeString('fr-FR')}</span>
            </div>
          )}
        </header>

        <div className="p-8">
          {tab === 'monitoring' && (
            <MonitoringTab
              usage={usage} plans={plans} loading={loading} error={error}
              onTabChange={setTab}
            />
          )}
          {tab === 'errors' && (
            <ErrorsTab usage={usage} loading={loading} error={error} />
          )}
          {tab === 'memories' && <PlaceholderTab tabId={tab} />}
        </div>
      </main>
    </div>
  )
}

// =====================================================
// MONITORING TAB
// =====================================================
function MonitoringTab({ usage, plans, loading, error, onTabChange }) {
  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 flex items-start gap-3">
        <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-medium text-red-300">Impossible de recuperer les donnees</div>
          <div className="text-sm text-red-400/70 mt-1 font-mono">{error}</div>
        </div>
      </div>
    )
  }

  if (loading && !usage) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton bg-white/[0.03] border border-white/5 rounded-xl h-32" />
          ))}
        </div>
        <div className="skeleton bg-white/[0.03] border border-white/5 rounded-xl h-80" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="skeleton bg-white/[0.03] border border-white/5 rounded-xl h-64" />
          <div className="skeleton bg-white/[0.03] border border-white/5 rounded-xl h-64" />
        </div>
        <div className="skeleton bg-white/[0.03] border border-white/5 rounded-xl h-64" />
      </div>
    )
  }

  if (!usage) return null

  const tokensPct = Math.min(100, (usage.today.total_tokens / usage.quota_per_user) * 100)
  const tokensAccent = tokensPct > 90 ? 'red' : tokensPct > 70 ? 'amber' : 'blue'
  const errorsAccent = usage.today.errors > 0 ? 'red' : 'green'

  return (
    <div className="space-y-6">
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            icon={Zap}
            label="Tokens aujourd'hui"
            value={usage.today.total_tokens.toLocaleString('fr-FR')}
            sub={`${tokensPct.toFixed(1)}% du quota interne ${usage.quota_per_user.toLocaleString('fr-FR')}`}
            accent={tokensAccent}
            progress={tokensPct}
          />
          <KPICard icon={Activity} label="Appels API"
            value={usage.today.total_calls.toLocaleString('fr-FR')} sub="aujourd'hui" accent="blue" />
          <KPICard
            icon={AlertCircle}
            label="Erreurs"
            value={usage.today.errors}
            sub={usage.today.errors === 0 ? 'tout fonctionne' : 'cliquer pour voir le detail'}
            accent={errorsAccent}
            onClick={() => onTabChange('errors')}
          />
          <KPICard icon={Users} label="Utilisateurs actifs"
            value={usage.today.unique_users}
            sub={`sur ${usage.by_user?.length || 2} comptes`} accent="blue" />
        </div>
        <HelpText>
          Activite de la journee en cours, remise a zero a minuit UTC. Le quota 200k est interne a l'app (protection), pas une limite Groq facturee. Clique sur la carte Erreurs pour voir le detail.
        </HelpText>
      </div>

      <LastSevenDaysChart data={usage.last_7_days} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UsageTable title="Repartition par utilisateur" icon={Users}
          rows={usage.by_user} nameKey="name"
          emptyMsg="Aucun utilisateur actif aujourd'hui"
          help="Qui consomme quoi aujourd'hui. Chaque user a un quota interne de 200k tokens/jour." />
        <UsageTable title="Repartition par endpoint" icon={Server}
          rows={usage.by_endpoint} nameKey="endpoint"
          emptyMsg="Aucun appel aujourd'hui"
          help="Repartition des appels par route API. Ratio sain : 1 extract_facts par chat." />
      </div>

      <PlansCard data={plans} />
    </div>
  )
}

// =====================================================
// ERRORS TAB
// =====================================================
function ErrorsTab({ usage, loading, error }) {
  const [filterEndpoint, setFilterEndpoint] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [expandedIdx, setExpandedIdx] = useState(null)

  const errors = usage?.recent_errors || []
  const patterns = useMemo(() => detectErrorPatterns(errors), [errors])

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 flex items-start gap-3">
        <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-medium text-red-300">Impossible de recuperer les donnees</div>
          <div className="text-sm text-red-400/70 mt-1 font-mono">{error}</div>
        </div>
      </div>
    )
  }

  if (loading && !usage) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="skeleton bg-white/[0.03] border border-white/5 rounded-xl h-32" />
          ))}
        </div>
        <div className="skeleton bg-white/[0.03] border border-white/5 rounded-xl h-96" />
      </div>
    )
  }

  if (!usage) return null

  const now = Date.now()
  const errors24h = errors.filter(e => (now - new Date(e.created_at)) < 24 * 3600 * 1000).length

  const endpointOptions = [...new Set(errors.map(e => e.endpoint))]
  const statusOptions   = [...new Set(errors.map(e => e.status_code))].sort()

  const filtered = errors.filter(e =>
    (filterEndpoint === 'all' || e.endpoint === filterEndpoint) &&
    (filterStatus === 'all'   || e.status_code === filterStatus)
  )

  if (errors.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-green-500/20 border border-green-500/30 mb-3">
            <CheckCircle2 size={24} className="text-green-400" strokeWidth={2} />
          </div>
          <h2 className="text-lg font-semibold text-green-300 mb-1">Aucune erreur recente</h2>
          <p className="text-sm text-green-400/70">Tout fonctionne correctement.</p>
        </div>
        <HelpText>
          Les erreurs sont collectees automatiquement par usage_logs (cf S3 audit). Un compteur a 0 signifie que tous les appels recents ont reussi (200 OK).
        </HelpText>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <KPICard icon={AlertCircle} label="Total erreurs collectees"
            value={errors.length} sub="dans le buffer recent"
            accent={errors.length > 10 ? 'red' : 'amber'} />
          <KPICard icon={AlertTriangle} label="Dernieres 24h"
            value={errors24h}
            sub={errors24h === 0 ? 'rien sur 24h' : 'a inspecter'}
            accent={errors24h > 5 ? 'red' : errors24h > 0 ? 'amber' : 'green'} />
        </div>
        <HelpText>
          recent_errors = buffer des dernieres erreurs serveur. Un pattern qui se repete (meme endpoint + meme code en boucle) signale un probleme structurel a regler.
        </HelpText>
      </div>

      {patterns.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 pulse-red">
          <div className="flex items-start gap-3 mb-3">
            <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-red-300">Pattern d'erreur recurrent detecte</div>
              <div className="text-xs text-red-400/70 mt-0.5">
                Plusieurs erreurs identiques dans une courte fenetre de temps
              </div>
            </div>
          </div>
          <div className="space-y-2 pl-8">
            {patterns.map((p, i) => (
              <div key={i} className="text-sm text-red-300 font-mono">
                <span className="font-bold">{p.count}×</span> erreur{' '}
                <span className="bg-red-500/20 px-1.5 py-0.5 rounded">{p.endpoint}</span>{' '}
                <span className="bg-red-500/20 px-1.5 py-0.5 rounded">HTTP {p.status_code}</span>{' '}
                <span className="text-red-400/70">en {p.windowMinutes} min</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
        <div className="text-xs uppercase tracking-wider text-[#6b6b78] font-medium mb-3">Filtres</div>
        <div className="flex flex-wrap gap-3">
          <FilterSelect label="Endpoint" value={filterEndpoint} onChange={setFilterEndpoint}
            options={[{ value: 'all', label: 'Tous endpoints' }, ...endpointOptions.map(o => ({ value: o, label: o }))]} />
          <FilterSelect label="Code HTTP" value={filterStatus}
            onChange={(v) => setFilterStatus(v === 'all' ? 'all' : parseInt(v, 10))}
            options={[{ value: 'all', label: 'Tous codes' }, ...statusOptions.map(o => ({ value: o, label: `HTTP ${o}` }))]} />
          <div className="flex-1 text-right text-xs text-[#6b6b78] font-mono self-end pb-2">
            {filtered.length} / {errors.length} erreurs
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-8 text-center text-sm text-[#6b6b78] font-mono">
            Aucune erreur ne correspond aux filtres actifs
          </div>
        ) : (
          filtered.map((err, idx) => (
            <ErrorCard key={idx} error={err}
              isExpanded={expandedIdx === idx}
              onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)} />
          ))
        )}
      </div>
    </div>
  )
}

function ErrorCard({ error, isExpanded, onToggle }) {
  const [copied, setCopied] = useState(false)
  const code = error.status_code
  const isServerErr = code >= 500
  const accent = isServerErr ? 'red' : 'amber'
  const accentClasses = {
    red:   { badge: 'bg-red-500/20 text-red-300 border-red-500/30',     text: 'text-red-400'   },
    amber: { badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30', text: 'text-amber-400' },
  }[accent]

  const fullMsg = error.error_msg || '(message vide)'
  const truncated = fullMsg.length > 120 ? fullMsg.slice(0, 120) + '...' : fullMsg

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullMsg)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) { /* clipboard restrictif sur certains navigateurs */ }
  }

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 hover:bg-white/[0.04] transition-all">
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <span className={`text-xs font-mono px-2 py-0.5 rounded-md border ${accentClasses.badge}`}>
          HTTP {code}
        </span>
        <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[#a0a0a8]">
          {error.endpoint}
        </span>
        <span className="text-xs text-[#6b6b78] font-mono">{timeAgo(error.created_at)}</span>
        <span className="text-[10px] text-[#4a4a52] font-mono ml-auto">
          {new Date(error.created_at).toLocaleString('fr-FR')}
        </span>
      </div>

      <div className={`text-sm font-mono leading-relaxed ${accentClasses.text} break-all`}>
        {isExpanded ? fullMsg : truncated}
      </div>

      {fullMsg.length > 120 && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5">
          <button onClick={onToggle}
            className="flex items-center gap-1.5 text-xs text-[#6b6b78] hover:text-[#5b9eff] transition-colors">
            {isExpanded ? (<><ChevronUp size={12} /><span>Reduire</span></>) : (<><ChevronDown size={12} /><span>Voir plus</span></>)}
          </button>
          <button onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-[#6b6b78] hover:text-[#39ff14] transition-colors">
            <Copy size={12} /><span>{copied ? 'Copie !' : 'Copier message complet'}</span>
          </button>
        </div>
      )}
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wider text-[#6b6b78]">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-[#0e0e14] border border-white/10 rounded-md px-3 py-1.5 text-sm text-[#e8e8ec] font-mono focus:outline-none focus:border-[#5b9eff]/50 transition-colors cursor-pointer">
        {options.map(opt => (
          <option key={opt.value} value={opt.value} className="bg-[#0e0e14]">{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

function detectErrorPatterns(errors) {
  const WINDOW_MS = 5 * 60 * 1000
  const THRESHOLD = 3
  const buckets = {}
  errors.forEach(e => {
    const key = `${e.endpoint}|${e.status_code}`
    if (!buckets[key]) buckets[key] = []
    buckets[key].push(new Date(e.created_at).getTime())
  })
  const patterns = []
  for (const [key, timestamps] of Object.entries(buckets)) {
    if (timestamps.length < THRESHOLD) continue
    timestamps.sort((a, b) => a - b)
    for (let i = 0; i <= timestamps.length - THRESHOLD; i++) {
      const span = timestamps[i + THRESHOLD - 1] - timestamps[i]
      if (span <= WINDOW_MS) {
        const [endpoint, status_code] = key.split('|')
        patterns.push({
          endpoint, status_code: parseInt(status_code, 10),
          count: timestamps.length,
          windowMinutes: Math.max(1, Math.round(span / 60000))
        })
        break
      }
    }
  }
  return patterns
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60)    return `il y a ${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60)    return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24)      return `il y a ${h}h`
  const j = Math.floor(h / 24)
  return `il y a ${j}j`
}

// =====================================================
// HELP TEXT
// =====================================================
function HelpText({ children }) {
  return (
    <div className="text-[11px] italic text-[#39ff14]/90 mt-2 leading-relaxed">
      {children}
    </div>
  )
}

// =====================================================
// LAST 7 DAYS CHART
// =====================================================
function LastSevenDaysChart({ data }) {
  const chartData = [...(data || [])].reverse().map(d => ({
    dayLabel: formatDayShort(d.day),
    dayFull:  formatDayFull(d.day),
    tokens:   d.tokens,
    calls:    d.calls,
  }))

  if (chartData.length === 0) {
    return (
      <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
        <ChartHeader />
        <HelpText>Cumul des tokens des 2 admins (Kat + Brice) par jour. Pas encore d'historique a afficher.</HelpText>
        <div className="h-64 flex items-center justify-center text-sm text-[#6b6b78] font-mono mt-4">
          Pas encore d'historique
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 hover:bg-white/[0.05] hover:border-white/10 transition-all">
      <ChartHeader />
      <HelpText>
        Cumul des tokens des 2 admins (Kat + Brice) par jour. Un pic eleve ne signifie pas un depassement individuel, c'est la somme des 2 quotas.
      </HelpText>
      <div className="h-72 mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="dayLabel"
              tick={{ fill: '#6b6b78', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
            <YAxis tickFormatter={formatTokensShort}
              tick={{ fill: '#6b6b78', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(91, 158, 255, 0.05)' }} />
            <Bar dataKey="tokens" fill="#5b9eff" radius={[4, 4, 0, 0]} maxBarSize={60} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ChartHeader() {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs uppercase tracking-wider text-[#6b6b78] font-medium mb-1">Activite 7 derniers jours</div>
        <div className="text-sm text-[#a0a0a8]">Tokens consommes par jour</div>
      </div>
      <div className="p-1.5 rounded-md bg-[#5b9eff]/10 border border-[#5b9eff]/20">
        <TrendingUp size={14} className="text-[#5b9eff]" strokeWidth={2} />
      </div>
    </div>
  )
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const { dayFull, tokens, calls } = payload[0].payload
  return (
    <div className="bg-[#0e0e14] border border-white/10 rounded-lg p-3 shadow-xl text-xs font-mono">
      <div className="text-[#a0a0a8] mb-1.5">{dayFull}</div>
      <div className="flex items-center gap-2 text-[#5b9eff]">
        <Zap size={11} strokeWidth={2} />
        <span>{tokens.toLocaleString('fr-FR')} tokens</span>
      </div>
      <div className="flex items-center gap-2 text-[#a0a0a8] mt-1">
        <Activity size={11} strokeWidth={2} />
        <span>{calls} appels</span>
      </div>
    </div>
  )
}

// =====================================================
// USAGE TABLE
// =====================================================
function UsageTable({ title, icon: Icon, rows, nameKey, emptyMsg, help }) {
  const sorted = [...(rows || [])].sort((a, b) => b.tokens - a.tokens)
  const totalTokens = sorted.reduce((acc, r) => acc + r.tokens, 0)
  const totalCalls  = sorted.reduce((acc, r) => acc + r.calls, 0)

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 hover:bg-white/[0.05] hover:border-white/10 transition-all">
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-wider text-[#6b6b78] font-medium">{title}</div>
        <div className="p-1.5 rounded-md bg-[#5b9eff]/10 border border-[#5b9eff]/20">
          <Icon size={14} className="text-[#5b9eff]" strokeWidth={2} />
        </div>
      </div>
      {help && <HelpText>{help}</HelpText>}

      {sorted.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-sm text-[#6b6b78] font-mono mt-4">{emptyMsg}</div>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-[#6b6b78] pb-2 border-b border-white/5">
            <div className="col-span-4">Nom</div>
            <div className="col-span-2 text-right">Calls</div>
            <div className="col-span-3 text-right">Tokens</div>
            <div className="col-span-3 text-right">%</div>
          </div>

          <div className="divide-y divide-white/5">
            {sorted.map((r, i) => {
              const pct = totalTokens > 0 ? (r.tokens / totalTokens) * 100 : 0
              return (
                <div key={i} className="grid grid-cols-12 gap-2 py-3 items-center text-sm">
                  <div className="col-span-4 text-[#e8e8ec] truncate" title={r[nameKey]}>{r[nameKey]}</div>
                  <div className="col-span-2 text-right font-mono text-[#a0a0a8] tabular-nums">{r.calls}</div>
                  <div className="col-span-3 text-right font-mono text-[#e8e8ec] tabular-nums">
                    {r.tokens.toLocaleString('fr-FR')}
                  </div>
                  <div className="col-span-3 flex items-center gap-2 justify-end">
                    <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden max-w-[60px]">
                      <div className="h-full bg-[#5b9eff] transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono text-xs text-[#a0a0a8] tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-12 gap-2 pt-3 mt-1 border-t border-white/5 text-xs">
            <div className="col-span-4 text-[#6b6b78] uppercase tracking-wider">Total</div>
            <div className="col-span-2 text-right font-mono text-[#a0a0a8] tabular-nums">{totalCalls}</div>
            <div className="col-span-3 text-right font-mono text-[#e8e8ec] tabular-nums">{totalTokens.toLocaleString('fr-FR')}</div>
            <div className="col-span-3" />
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================
// PLANS CARD
// =====================================================
function PlansCard({ data }) {
  if (!data) {
    return (
      <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-6 text-center">
        <div className="text-xs text-[#6b6b78] font-mono">Endpoint /admin/plans indisponible</div>
      </div>
    )
  }

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 hover:bg-white/[0.05] hover:border-white/10 transition-all">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-[#6b6b78] font-medium mb-1">Plans & limites</div>
          <div className="text-sm text-[#a0a0a8] flex items-center gap-2">
            <span>Cout aujourd'hui :</span>
            <span className="font-mono text-[#39ff14] font-medium">{data.cost_today_eur} €</span>
          </div>
        </div>
        <div className="p-1.5 rounded-md bg-[#5b9eff]/10 border border-[#5b9eff]/20">
          <Server size={14} className="text-[#5b9eff]" strokeWidth={2} />
        </div>
      </div>
      <HelpText>
        Tous les services sont en free tier. Groq bloque temporairement (HTTP 429) si on depasse 8000 TPM mais ne facture jamais. A surveiller : Mistral et ElevenLabs ont des seuils mensuels.
      </HelpText>

      <div className="mt-4">
        <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-[#6b6b78] pb-2 border-b border-white/5">
          <div className="col-span-1"></div>
          <div className="col-span-3">Service</div>
          <div className="col-span-2">Plan</div>
          <div className="col-span-3">Limite</div>
          <div className="col-span-3">Note</div>
        </div>

        <div className="divide-y divide-white/5">
          {data.plans.map(p => (
            <div key={p.id} className="grid grid-cols-12 gap-2 py-3 items-center text-sm">
              <div className="col-span-1 flex items-center">
                {p.status === 'ok' ? <Check size={14} className="text-[#39ff14]" strokeWidth={2.5} /> : <Eye size={14} className="text-amber-400" strokeWidth={2} />}
              </div>
              <div className="col-span-3 font-medium text-[#e8e8ec]">{p.label}</div>
              <div className="col-span-2 text-[#a0a0a8] font-mono text-xs">{p.plan}</div>
              <div className="col-span-3 text-[#6b6b78] font-mono text-xs">{p.limit}</div>
              <div className="col-span-3 text-[#6b6b78] text-xs italic">{p.note}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-4 text-[10px] uppercase tracking-wider text-[#6b6b78]">
          <div className="flex items-center gap-1.5"><Check size={11} className="text-[#39ff14]" strokeWidth={2.5} /><span>OK</span></div>
          <div className="flex items-center gap-1.5"><Eye size={11} className="text-amber-400" strokeWidth={2} /><span>A surveiller</span></div>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// Helpers de formatage
// =====================================================

function formatDayShort(iso) {
  const datePart = iso.slice(0, 10)
  const [, mm, dd] = datePart.split('-')
  return `${dd}/${mm}`
}

function formatDayFull(iso) {
  const datePart = iso.slice(0, 10)
  const [y, m, d] = datePart.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'
  })
}

function formatTokensShort(n) {
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return n.toString()
}

// =====================================================
// KPI CARD - supporte onClick optionnel pour navigation drill-down
// =====================================================
function KPICard({ icon: Icon, label, value, sub, accent = 'blue', progress, onClick }) {
  const accentMap = {
    blue:  { text: 'text-[#5b9eff]',   bg: 'bg-[#5b9eff]/10',   border: 'border-[#5b9eff]/20',   bar: 'bg-[#5b9eff]'   },
    green: { text: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/20',   bar: 'bg-green-500'   },
    amber: { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   bar: 'bg-amber-500'   },
    red:   { text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20',     bar: 'bg-red-500'     },
  }
  const c = accentMap[accent] || accentMap.blue
  const isClickable = !!onClick

  const hoverClasses = isClickable
    ? 'cursor-pointer hover:bg-white/[0.07] hover:border-[#5b9eff]/40 hover:scale-[1.01]'
    : 'hover:bg-white/[0.05] hover:border-white/10'

  return (
    <div
      className={`relative bg-white/[0.03] border border-white/5 rounded-xl p-5 transition-all ${hoverClasses}`}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
    >
      {isClickable && (
        <div className="absolute top-2 right-2 opacity-30 hover:opacity-80 transition-opacity">
          <ArrowUpRight size={12} className={c.text} strokeWidth={2} />
        </div>
      )}

      <div className="flex items-start justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-[#6b6b78] font-medium">{label}</span>
        <div className={`p-1.5 rounded-md ${c.bg} ${c.border} border`}>
          <Icon size={14} className={c.text} strokeWidth={2} />
        </div>
      </div>
      <div className="font-mono text-3xl font-medium text-[#e8e8ec] tabular-nums">{value}</div>
      <div className="text-xs text-[#6b6b78] mt-1.5 font-mono">{sub}</div>
      {progress !== undefined && (
        <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
          <div className={`h-full ${c.bar} transition-all duration-500`} style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      )}
    </div>
  )
}

// =====================================================
// PLACEHOLDER - 1 onglet restant "Soon" (memories)
// =====================================================
function PlaceholderTab({ tabId }) {
  const descs = {
    memories: {
      title: 'Memoires & Reflexions',
      desc: 'Liste des memoires N0/N1/N2 + bouton force reflect + historique des reflexions N4 avec dedup vectoriel.'
    },
  }
  const d = descs[tabId]
  if (!d) return null

  return (
    <div className="max-w-md mx-auto mt-20 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 mb-4">
        <Cpu size={20} className="text-[#6b6b78]" strokeWidth={1.5} />
      </div>
      <h2 className="text-lg font-semibold mb-2">{d.title}</h2>
      <p className="text-sm text-[#6b6b78] leading-relaxed">{d.desc}</p>
      <div className="mt-6 inline-block px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-mono">
        A venir
      </div>
    </div>
  )
}