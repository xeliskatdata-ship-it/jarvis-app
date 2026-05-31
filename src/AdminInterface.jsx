import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Brain, Cpu, AlertCircle,
  ChevronLeft, Zap, Activity, Users, AlertTriangle,
  RefreshCw
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const REFRESH_MS = 30000  // auto-refresh toutes les 30s

// IDs admin : Kat (1), Brice (2). Aligne avec le backend (Admin IDs : [1, 2]).
const ADMIN_IDS = [1, 2]

// Definition des onglets de la sidebar. Seul 'monitoring' est actif en V1.
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
            <MonitoringTab usage={usage} loading={loading} error={error} />
          )}
          {tab !== 'monitoring' && <PlaceholderTab tabId={tab} />}
        </div>
      </main>
    </div>
  )
}

// =====================================================
// MONITORING TAB - V1 : 4 KPI cards seulement
// =====================================================
function MonitoringTab({ usage, loading, error }) {
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

  // Skeleton loader au 1er fetch
  if (loading && !usage) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton bg-white/[0.03] border border-white/5 rounded-xl h-32" />
        ))}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={Zap}
          label="Tokens aujourd'hui"
          value={usage.today.total_tokens.toLocaleString('fr-FR')}
          sub={`${tokensPct.toFixed(1)}% du quota ${usage.quota_per_user.toLocaleString('fr-FR')}`}
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

      {/* Placeholder briques V2+ */}
      <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-12 text-center">
        <div className="text-sm text-[#6b6b78] font-mono">
          Graphe 7 jours + tableau utilisateurs + tableau endpoints
        </div>
        <div className="text-xs text-[#4a4a52] mt-1">prochaines briques</div>
      </div>
    </div>
  )
}

// =====================================================
// KPI CARD - composant reutilisable
// =====================================================
function KPICard({ icon: Icon, label, value, sub, accent = 'blue', progress }) {
  // Mapping accent -> classes Tailwind (precalcule pour eviter les classes dynamiques)
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
