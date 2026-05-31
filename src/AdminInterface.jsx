import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Brain, Cpu, AlertCircle,
  ChevronLeft, Zap, Activity, Users, AlertTriangle,
  RefreshCw, TrendingUp, Server, Check, Eye
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const REFRESH_MS = 30000  // auto-refresh toutes les 30s

// IDs admin : Kat (1), Brice (2). Aligne avec le backend (Admin IDs : [1, 2]).
const ADMIN_IDS = [1, 2]

// Definition des onglets de la sidebar. Seul 'monitoring' est actif en V1/V2.
const TABS = [
  { id: 'monitoring', label: 'Monitoring',           icon: LayoutDashboard, active: true  },
  { id: 'memories',   label: 'Memoires & Reflexions',icon: Brain,           active: false },
  { id: 'persona',    label: 'Persona',              icon: Cpu,             active: false },
  { id: 'errors',     label: 'Erreurs',              icon: AlertCircle,     active: false },
]

export default function AdminInterface({ auth, onLogout }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('monitoring')
  const [usage, setUsage] = useState(null)
  const [plans, setPlans] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastFetch, setLastFetch] = useState(null)

  // Garde : si l'user n'est pas admin, on le renvoie au chat
  useEffect(() => {
    if (!ADMIN_IDS.includes(auth?.user?.id)) {
      navigate('/', { replace: true })
    }
  }, [auth, navigate])

  // Fetch /admin/usage avec auto-refresh 30s
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

  // Fetch /admin/plans une seule fois au mount (config statique, pas besoin d'auto-refresh)
  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/admin/plans`, {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setPlans(d) })
      .catch(() => { /* silencieux : non bloquant pour l'affichage des autres briques */ })
    return () => { cancelled = true }
  }, [auth.token])

  // Evite le flash pendant la redirection
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
      `}</style>

      {/* === Sidebar gauche === */}
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

      {/* === Main === */}
      <main className="flex-1 overflow-auto">
        <header className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {TABS.find(t => t.id === tab)?.label}
            </h1>
            <p className="text-sm text-[#6b6b78] mt-1">Surveillance temps reel de Wall-E</p>
          </div>

          {tab === 'monitoring' && lastFetch && (
            <div className="text-xs text-[#6b6b78] flex items-center gap-2 font-mono">
              <RefreshCw size={12} className={loading ? 'spin' : ''} />
              <span>maj {lastFetch.toLocaleTimeString('fr-FR')}</span>
            </div>
          )}
        </header>

        <div className="p-8">
          {tab === 'monitoring' && (
            <MonitoringTab usage={usage} plans={plans} loading={loading} error={error} />
          )}
          {tab !== 'monitoring' && <PlaceholderTab tabId={tab} />}
        </div>
      </main>
    </div>
  )
}

// =====================================================
// MONITORING TAB - V2.3 : KPI + graphe + tableaux + plans + helpTexts
// =====================================================
function MonitoringTab({ usage, plans, loading, error }) {
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

  // Skeleton loader au 1er fetch (KPI + graphe + tableaux + plans)
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

  // Calcul % quota + couleur dynamique
  const tokensPct = Math.min(100, (usage.today.total_tokens / usage.quota_per_user) * 100)
  const tokensAccent = tokensPct > 90 ? 'red' : tokensPct > 70 ? 'amber' : 'blue'
  const errorsAccent = usage.today.errors > 0 ? 'red' : 'green'

  return (
    <div className="space-y-6">
      {/* === KPI cards + aide globale === */}
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
          <KPICard
            icon={Activity}
            label="Appels API"
            value={usage.today.total_calls.toLocaleString('fr-FR')}
            sub="aujourd'hui"
            accent="blue"
          />
          <KPICard
            icon={AlertCircle}
            label="Erreurs"
            value={usage.today.errors}
            sub={usage.today.errors === 0 ? 'tout fonctionne' : 'a inspecter'}
            accent={errorsAccent}
          />
          <KPICard
            icon={Users}
            label="Utilisateurs actifs"
            value={usage.today.unique_users}
            sub={`sur ${usage.by_user?.length || 2} comptes`}
            accent="blue"
          />
        </div>
        <HelpText>
          Activite de la journee en cours, remise a zero a minuit UTC. Le quota 200k est interne a l'app (protection), pas une limite Groq facturee.
        </HelpText>
      </div>

      {/* === Graphe 7 jours === */}
      <LastSevenDaysChart data={usage.last_7_days} />

      {/* === Tableaux by_user + by_endpoint === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UsageTable
          title="Repartition par utilisateur"
          icon={Users}
          rows={usage.by_user}
          nameKey="name"
          emptyMsg="Aucun utilisateur actif aujourd'hui"
          help="Qui consomme quoi aujourd'hui. Chaque user a un quota interne de 200k tokens/jour."
        />
        <UsageTable
          title="Repartition par endpoint"
          icon={Server}
          rows={usage.by_endpoint}
          nameKey="endpoint"
          emptyMsg="Aucun appel aujourd'hui"
          help="Repartition des appels par route API. Ratio sain : 1 extract_facts par chat."
        />
      </div>

      {/* === Plans & limites (nouveau V2.3) === */}
      <PlansCard data={plans} />
    </div>
  )
}

// =====================================================
// HELP TEXT - aide italique vert fluo sous chaque section
// =====================================================
function HelpText({ children }) {
  return (
    <div className="text-[11px] italic text-[#39ff14]/90 mt-2 leading-relaxed">
      {children}
    </div>
  )
}

// =====================================================
// LAST 7 DAYS CHART - BarChart recharts
// =====================================================
function LastSevenDaysChart({ data }) {
  // Backend renvoie tri descendant (recent -> vieux). On inverse pour lecture chrono gauche->droite.
  // Slice les 10 premiers caracteres de day pour rester en UTC pur et eviter le decalage TZ.
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
        <HelpText>
          Cumul des tokens des 2 admins (Kat + Brice) par jour. Pas encore d'historique a afficher.
        </HelpText>
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
            <XAxis
              dataKey="dayLabel"
              tick={{ fill: '#6b6b78', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatTokensShort}
              tick={{ fill: '#6b6b78', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'rgba(91, 158, 255, 0.05)' }}
            />
            <Bar
              dataKey="tokens"
              fill="#5b9eff"
              radius={[4, 4, 0, 0]}
              maxBarSize={60}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// Header du graphe (titre + sous-titre)
function ChartHeader() {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs uppercase tracking-wider text-[#6b6b78] font-medium mb-1">
          Activite 7 derniers jours
        </div>
        <div className="text-sm text-[#a0a0a8]">Tokens consommes par jour</div>
      </div>
      <div className="p-1.5 rounded-md bg-[#5b9eff]/10 border border-[#5b9eff]/20">
        <TrendingUp size={14} className="text-[#5b9eff]" strokeWidth={2} />
      </div>
    </div>
  )
}

// Tooltip custom dark, aligne sur le style des cards
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
// USAGE TABLE - tableau generique reutilisable
// =====================================================
function UsageTable({ title, icon: Icon, rows, nameKey, emptyMsg, help }) {
  // Tri descendant sur tokens sans muter la source. Garde-fou si rows undefined.
  const sorted = [...(rows || [])].sort((a, b) => b.tokens - a.tokens)
  const totalTokens = sorted.reduce((acc, r) => acc + r.tokens, 0)
  const totalCalls  = sorted.reduce((acc, r) => acc + r.calls, 0)

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 hover:bg-white/[0.05] hover:border-white/10 transition-all">
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-wider text-[#6b6b78] font-medium">
          {title}
        </div>
        <div className="p-1.5 rounded-md bg-[#5b9eff]/10 border border-[#5b9eff]/20">
          <Icon size={14} className="text-[#5b9eff]" strokeWidth={2} />
        </div>
      </div>
      {help && <HelpText>{help}</HelpText>}

      {sorted.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-sm text-[#6b6b78] font-mono mt-4">
          {emptyMsg}
        </div>
      ) : (
        <div className="mt-4">
          {/* Header colonnes */}
          <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-[#6b6b78] pb-2 border-b border-white/5">
            <div className="col-span-4">Nom</div>
            <div className="col-span-2 text-right">Calls</div>
            <div className="col-span-3 text-right">Tokens</div>
            <div className="col-span-3 text-right">%</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-white/5">
            {sorted.map((r, i) => {
              const pct = totalTokens > 0 ? (r.tokens / totalTokens) * 100 : 0
              return (
                <div key={i} className="grid grid-cols-12 gap-2 py-3 items-center text-sm">
                  <div className="col-span-4 text-[#e8e8ec] truncate" title={r[nameKey]}>
                    {r[nameKey]}
                  </div>
                  <div className="col-span-2 text-right font-mono text-[#a0a0a8] tabular-nums">
                    {r.calls}
                  </div>
                  <div className="col-span-3 text-right font-mono text-[#e8e8ec] tabular-nums">
                    {r.tokens.toLocaleString('fr-FR')}
                  </div>
                  <div className="col-span-3 flex items-center gap-2 justify-end">
                    <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden max-w-[60px]">
                      <div
                        className="h-full bg-[#5b9eff] transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-[#a0a0a8] tabular-nums w-10 text-right">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer total */}
          <div className="grid grid-cols-12 gap-2 pt-3 mt-1 border-t border-white/5 text-xs">
            <div className="col-span-4 text-[#6b6b78] uppercase tracking-wider">Total</div>
            <div className="col-span-2 text-right font-mono text-[#a0a0a8] tabular-nums">
              {totalCalls}
            </div>
            <div className="col-span-3 text-right font-mono text-[#e8e8ec] tabular-nums">
              {totalTokens.toLocaleString('fr-FR')}
            </div>
            <div className="col-span-3" />
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================
// PLANS CARD - V2.3 : liste services + cout du jour
// =====================================================
function PlansCard({ data }) {
  // Si l'endpoint n'a pas repondu, on n'affiche pas la carte (silencieux, non bloquant)
  if (!data) {
    return (
      <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-6 text-center">
        <div className="text-xs text-[#6b6b78] font-mono">
          Endpoint /admin/plans indisponible
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 hover:bg-white/[0.05] hover:border-white/10 transition-all">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-[#6b6b78] font-medium mb-1">
            Plans & limites
          </div>
          <div className="text-sm text-[#a0a0a8] flex items-center gap-2">
            <span>Cout aujourd'hui :</span>
            <span className="font-mono text-[#39ff14] font-medium">
              {data.cost_today_eur} €
            </span>
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
        {/* Header colonnes */}
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
                {p.status === 'ok' ? (
                  <Check size={14} className="text-[#39ff14]" strokeWidth={2.5} />
                ) : (
                  <Eye size={14} className="text-amber-400" strokeWidth={2} />
                )}
              </div>
              <div className="col-span-3 font-medium text-[#e8e8ec]">{p.label}</div>
              <div className="col-span-2 text-[#a0a0a8] font-mono text-xs">{p.plan}</div>
              <div className="col-span-3 text-[#6b6b78] font-mono text-xs">{p.limit}</div>
              <div className="col-span-3 text-[#6b6b78] text-xs italic">{p.note}</div>
            </div>
          ))}
        </div>

        {/* Legende */}
        <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-4 text-[10px] uppercase tracking-wider text-[#6b6b78]">
          <div className="flex items-center gap-1.5">
            <Check size={11} className="text-[#39ff14]" strokeWidth={2.5} />
            <span>OK</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Eye size={11} className="text-amber-400" strokeWidth={2} />
            <span>A surveiller</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// Helpers de formatage date / nombre
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
// KPI CARD - composant reutilisable
// =====================================================
function KPICard({ icon: Icon, label, value, sub, accent = 'blue', progress }) {
  const accentMap = {
    blue:  { text: 'text-[#5b9eff]',   bg: 'bg-[#5b9eff]/10',   border: 'border-[#5b9eff]/20',   bar: 'bg-[#5b9eff]'   },
    green: { text: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/20',   bar: 'bg-green-500'   },
    amber: { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   bar: 'bg-amber-500'   },
    red:   { text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20',     bar: 'bg-red-500'     },
  }
  const c = accentMap[accent] || accentMap.blue

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 hover:bg-white/[0.05] hover:border-white/10 transition-all">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-[#6b6b78] font-medium">{label}</span>
        <div className={`p-1.5 rounded-md ${c.bg} ${c.border} border`}>
          <Icon size={14} className={c.text} strokeWidth={2} />
        </div>
      </div>
      <div className="font-mono text-3xl font-medium text-[#e8e8ec] tabular-nums">
        {value}
      </div>
      <div className="text-xs text-[#6b6b78] mt-1.5 font-mono">{sub}</div>
      {progress !== undefined && (
        <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full ${c.bar} transition-all duration-500`}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}
    </div>
  )
}

// =====================================================
// PLACEHOLDER - 3 onglets "Soon"
// =====================================================
function PlaceholderTab({ tabId }) {
  const descs = {
    memories: {
      title: 'Memoires & Reflexions',
      desc: 'Liste des memoires N0/N1/N2 + bouton force reflect + historique des reflexions N4 avec dedup vectoriel.'
    },
    persona: {
      title: 'Persona',
      desc: 'Version active + system prompt complet (lecture seule) + temperature + switch Jarvis ↔ Wall-E sans redeploiement.'
    },
    errors: {
      title: 'Erreurs',
      desc: 'Historique detaille des erreurs serveur + filtrage par endpoint + stack traces + frequence par jour.'
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
