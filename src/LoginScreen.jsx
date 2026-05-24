import { useState } from 'react'
import { Sparkles, ArrowRight, AlertCircle } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async () => {
    if (!email || !password) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur de connexion')
      onLogin(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#06060a] text-[#e8e8ec] flex items-center justify-center px-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@300;400;500&display=swap');
        .font-display { font-family: 'Instrument Serif', serif; font-weight: 400; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }

        @keyframes grid-drift {
          0% { background-position: 0 0; }
          100% { background-position: 50px 50px; }
        }
        .bg-grid {
          background-image:
            linear-gradient(rgba(91,158,255,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(91,158,255,0.05) 1px, transparent 1px);
          background-size: 50px 50px;
          animation: grid-drift 30s linear infinite;
        }

        @keyframes breathe {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        .breathe { animation: breathe 3s ease-in-out infinite; }

        @keyframes scan-line {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        .scan-line { animation: scan-line 8s linear infinite; }

        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in { animation: fade-in 0.6s ease-out forwards; }

        .glow-text { text-shadow: 0 0 30px rgba(91,158,255,0.6); }
      `}</style>

      {/* Background atmosphérique : grille + radial + scan */}
      <div className="absolute inset-0 bg-grid opacity-60 pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: 'radial-gradient(circle at 50% 50%, rgba(91,158,255,0.1), transparent 60%)' }} />
      <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#5b9eff]/30 to-transparent scan-line pointer-events-none" />

      <div className="relative z-10 max-w-sm w-full fade-in">
        <div className="text-center mb-12">
          <Sparkles className="w-8 h-8 text-[#5b9eff] mx-auto mb-6 breathe" strokeWidth={1} />
          <h1 className="font-display text-6xl italic glow-text mb-3">Jarvis</h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#6b6b78]">
            authentification requise
          </p>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[#6b6b78] mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 focus:border-[#5b9eff]/50 focus:outline-none font-mono text-sm text-[#e8e8ec] placeholder-[#3a3a44] transition-colors"
              placeholder="kat@jarvis.local"
              autoFocus
              disabled={loading}
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[#6b6b78] mb-2">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 focus:border-[#5b9eff]/50 focus:outline-none font-mono text-sm text-[#e8e8ec] placeholder-[#3a3a44] transition-colors"
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 font-mono text-xs">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !email || !password}
            className="w-full py-3 rounded-lg bg-[#5b9eff] text-[#06060a] font-mono text-xs uppercase tracking-[0.25em] hover:bg-[#7eb3ff] transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
          >
            {loading ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#06060a] animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#06060a] animate-pulse" style={{ animationDelay: '0.2s' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#06060a] animate-pulse" style={{ animationDelay: '0.4s' }} />
              </>
            ) : (
              <>
                S'authentifier <ArrowRight size={14} strokeWidth={2} />
              </>
            )}
          </button>
        </div>

        <p className="font-mono text-[10px] text-[#6b6b78] text-center mt-12 tracking-wider">
          système privé · accès restreint
        </p>
      </div>
    </div>
  )
}
