import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, Settings, X, AlertCircle, LogOut } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// George - voix masculine UK posh, signature Jarvis-like
const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'

// Nombre de messages affichés à l'écran - le contexte LLM reste plus large côté backend
const VISIBLE_MESSAGES = 4

const prefsKey = (userId) => `jarvis_prefs_${userId}`

// ========== Composant JarvisOrb (SVG animé) ==========
// state: 'idle' (breathing) | 'listening' (user parle) | 'speaking' (Jarvis parle)
function JarvisOrb({ state = 'idle', size = 180 }) {
  const segments = Array.from({ length: 48 })
  return (
    <div className={`jarvis-orb orb-${state}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 200 200" className="w-full h-full">
        <defs>
          <radialGradient id="orbCoreGrad">
            <stop offset="0%" stopColor="#a8d0ff" stopOpacity="0.95" />
            <stop offset="40%" stopColor="#5b9eff" stopOpacity="0.6" />
            <stop offset="80%" stopColor="#5b9eff" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#5b9eff" stopOpacity="0" />
          </radialGradient>
          <filter id="orbGlow">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Outer rotating ring with radial tick segments */}
        <g className="orb-outer" filter="url(#orbGlow)">
          {segments.map((_, i) => {
            const long = i % 6 === 0
            return (
              <line
                key={i}
                x1="100" y1={long ? "6" : "10"}
                x2="100" y2={long ? "20" : "16"}
                stroke="#5b9eff"
                strokeOpacity={long ? "0.9" : "0.4"}
                strokeWidth={long ? "2" : "1"}
                transform={`rotate(${i * 7.5} 100 100)`}
              />
            )
          })}
        </g>

        {/* Middle dashed ring */}
        <circle cx="100" cy="100" r="70" fill="none"
                stroke="#5b9eff" strokeOpacity="0.35"
                strokeWidth="1" strokeDasharray="2 6" />

        {/* Counter-rotating accent arc */}
        <g className="orb-arc">
          <path d="M 100 35 A 65 65 0 0 1 165 100"
                stroke="#5b9eff" strokeWidth="2.5" fill="none"
                strokeLinecap="round" filter="url(#orbGlow)" />
          <path d="M 100 165 A 65 65 0 0 1 35 100"
                stroke="#5b9eff" strokeWidth="1.5" fill="none"
                strokeOpacity="0.5" strokeLinecap="round" />
        </g>

        {/* Inner static ring */}
        <circle cx="100" cy="100" r="48" fill="none"
                stroke="#5b9eff" strokeOpacity="0.6" strokeWidth="1.5" />

        {/* Core luminous - le coeur qui pulse */}
        <circle cx="100" cy="100" r="42" fill="url(#orbCoreGrad)" className="orb-core" />

        {/* Center dot */}
        <circle cx="100" cy="100" r="2" fill="#ffffff" opacity="0.9" />
      </svg>
    </div>
  )
}

// ========== Composant principal ==========
export default function JarvisInterface({ auth, onLogout }) {
  const [messages, setMessages] = useState([])
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isJarvisSpeaking, setIsJarvisSpeaking] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [finalTranscript, setFinalTranscript] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState(null)
  const [speechSupported, setSpeechSupported] = useState(true)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [orbSize, setOrbSize] = useState(550)  // responsive : recalculé selon viewport

  const [elevenlabsKey, setElevenlabsKey] = useState('')
  const [elevenlabsVoiceId, setElevenlabsVoiceId] = useState(DEFAULT_VOICE_ID)

  const recognitionRef = useRef(null)
  const messagesEndRef = useRef(null)
  const audioRef = useRef(null)

  // Calcul de la taille de l'orb selon le viewport - responsive desktop/tablet/mobile
  useEffect(() => {
    const computeOrbSize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      // Max raisonnable : 60% de la dimension la plus petite, capé à 600
      const max = Math.min(w * 0.6, h * 0.55, 600)
      setOrbSize(Math.max(220, Math.floor(max)))  // minimum 220 sur très petit écran
    }
    computeOrbSize()
    window.addEventListener('resize', computeOrbSize)
    return () => window.removeEventListener('resize', computeOrbSize)
  }, [])

  // Charge prefs user
  useEffect(() => {
    const stored = localStorage.getItem(prefsKey(auth.user.id))
    if (stored) {
      try {
        const p = JSON.parse(stored)
        if (p.elevenlabsKey) setElevenlabsKey(p.elevenlabsKey)
        if (p.elevenlabsVoiceId) setElevenlabsVoiceId(p.elevenlabsVoiceId)
      } catch {}
    }
  }, [auth.user.id])

  useEffect(() => {
    localStorage.setItem(prefsKey(auth.user.id), JSON.stringify({ elevenlabsKey, elevenlabsVoiceId }))
  }, [auth.user.id, elevenlabsKey, elevenlabsVoiceId])

  // Web Speech API setup
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setSpeechSupported(false); return }
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'fr-FR'
    rec.onresult = (event) => {
      let interim = '', final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) final += t
        else interim += t
      }
      if (interim) setInterimTranscript(interim)
      if (final) setFinalTranscript(prev => prev + final)
    }
    rec.onerror = (e) => { setError(`Erreur micro : ${e.error}`); setIsListening(false) }
    rec.onend = () => setIsListening(false)
    recognitionRef.current = rec
  }, [])

  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices()
    }
  }, [])

  // Charge l'historique au login
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await fetch(`${API_URL}/history`, {
          headers: { 'Authorization': `Bearer ${auth.token}` }
        })
        if (res.status === 401) { onLogout(); return }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const msgs = (data.messages || []).map(m => ({
          role: m.role === 'assistant' ? 'jarvis' : 'user',
          content: m.content,
          ts: new Date(m.created_at).getTime()
        }))
        setMessages(msgs)
      } catch (err) {
        console.warn('Historique:', err.message)
      } finally {
        setHistoryLoaded(true)
      }
    }
    loadHistory()
  }, [auth.token, onLogout])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isProcessing])

  // ===== TTS avec tracking speaking state =====
  const speakWithBrowser = (text) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'fr-FR'
    utt.rate = 1.0
    const voices = window.speechSynthesis.getVoices()
    const fr = voices.find(v => v.lang === 'fr-FR' && /paul|thomas|male/i.test(v.name))
             || voices.find(v => v.lang === 'fr-FR' && /microsoft|google/i.test(v.name))
             || voices.find(v => v.lang.startsWith('fr'))
    if (fr) utt.voice = fr

    utt.onstart = () => setIsJarvisSpeaking(true)
    utt.onend = () => setIsJarvisSpeaking(false)
    utt.onerror = () => setIsJarvisSpeaking(false)

    window.speechSynthesis.speak(utt)
  }

  const playAudioUrl = (url) => {
    if (audioRef.current) audioRef.current.pause()
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onplay = () => setIsJarvisSpeaking(true)
    audio.onended = () => setIsJarvisSpeaking(false)
    audio.onerror = () => setIsJarvisSpeaking(false)
    audio.play().catch(e => { console.warn('Audio bloqué:', e.message); setIsJarvisSpeaking(false) })
  }

  const synthesizeElevenLabs = async (text) => {
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenlabsVoiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': elevenlabsKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      })
      if (!res.ok) throw new Error(`ElevenLabs ${res.status}`)
      const blob = await res.blob()
      playAudioUrl(URL.createObjectURL(blob))
    } catch (err) {
      console.warn('TTS ElevenLabs échec, fallback navigateur:', err.message)
      speakWithBrowser(text)
    }
  }

  // ===== Envoi au backend =====
  const sendToBackend = useCallback(async (text) => {
    if (!text.trim()) return
    setMessages(prev => [...prev, { role: 'user', content: text, ts: Date.now() }])
    setIsProcessing(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
        body: JSON.stringify({ transcript: text })
      })
      if (res.status === 401) { onLogout(); return }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      const reply = data.reply || "Pas de réponse reçue."
      setMessages(prev => [...prev, { role: 'jarvis', content: reply, ts: Date.now() }])
      if (elevenlabsKey) await synthesizeElevenLabs(reply)
      else speakWithBrowser(reply)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsProcessing(false)
    }
  }, [auth.token, elevenlabsKey, elevenlabsVoiceId, onLogout])

  const toggleListening = () => {
    if (!speechSupported) {
      setError("Reconnaissance vocale non supportée (utilise Chrome/Edge).")
      return
    }
    setError(null)
    if (isListening) {
      recognitionRef.current?.stop()
    } else {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      if (audioRef.current) audioRef.current.pause()
      setIsJarvisSpeaking(false)
      setInterimTranscript('')
      setFinalTranscript('')
      try {
        recognitionRef.current?.start()
        setIsListening(true)
      } catch (e) {
        setError('Impossible de démarrer le micro.')
      }
    }
  }

  useEffect(() => {
    if (!isListening && finalTranscript.trim()) {
      const t = finalTranscript.trim()
      setFinalTranscript('')
      setInterimTranscript('')
      sendToBackend(t)
    }
  }, [isListening, finalTranscript, sendToBackend])

  const liveTranscript = (finalTranscript + ' ' + interimTranscript).trim()

  const orbState = isJarvisSpeaking ? 'speaking'
                 : isListening ? 'listening'
                 : isProcessing ? 'processing'
                 : 'idle'

  const statusLabel = isJarvisSpeaking ? 'jarvis parle'
                    : isListening ? 'écoute active'
                    : isProcessing ? 'traitement'
                    : `bonjour ${auth.user.name.toLowerCase()}`

  const isEmpty = historyLoaded && messages.length === 0 && !isProcessing

  // N'affiche que les N derniers messages - le contexte complet reste côté serveur
  const visibleMessages = messages.slice(-VISIBLE_MESSAGES)

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#06060a] text-[#e8e8ec]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@300;400;500&display=swap');
        .font-display { font-family: 'Instrument Serif', serif; font-weight: 400; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }

        @keyframes grid-drift { 0% { background-position: 0 0; } 100% { background-position: 50px 50px; } }
        .bg-grid {
          background-image: linear-gradient(rgba(91,158,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(91,158,255,0.05) 1px, transparent 1px);
          background-size: 50px 50px;
          animation: grid-drift 30s linear infinite;
        }

        @keyframes pulse-ring { 0% { transform: scale(0.9); opacity: 0.7; } 100% { transform: scale(2.2); opacity: 0; } }
        .pulse-ring { animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        .pulse-ring-2 { animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; animation-delay: 0.6s; }
        .pulse-ring-3 { animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; animation-delay: 1.2s; }

        @keyframes breathe { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.05); } }
        .breathe { animation: breathe 3s ease-in-out infinite; }

        @keyframes scan-line { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
        .scan-line { animation: scan-line 8s linear infinite; }

        @keyframes message-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .msg-in { animation: message-in 0.4s ease-out forwards; }

        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .shimmer-text {
          background: linear-gradient(90deg, #6b6b78 0%, #5b9eff 50%, #6b6b78 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: shimmer 2s linear infinite;
        }

        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
        .cursor-blink { animation: blink 1s step-end infinite; }

        .glow-accent { box-shadow: 0 0 40px rgba(91,158,255,0.4), inset 0 0 20px rgba(91,158,255,0.1); }
        .glow-text { text-shadow: 0 0 20px rgba(91,158,255,0.5); }

        /* ====== Jarvis Orb animations ====== */
        @keyframes orb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes orb-spin-reverse { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        @keyframes orb-core-breathe {
          0%, 100% { transform: scale(0.95); opacity: 0.7; }
          50% { transform: scale(1.05); opacity: 1; }
        }
        @keyframes orb-core-speak {
          0%, 100% { transform: scale(0.9); opacity: 0.8; filter: brightness(1); }
          25% { transform: scale(1.15); opacity: 1; filter: brightness(1.4); }
          50% { transform: scale(1); opacity: 0.95; filter: brightness(1.2); }
          75% { transform: scale(1.1); opacity: 1; filter: brightness(1.3); }
        }
        @keyframes orb-core-listen {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          50% { transform: scale(1.08); opacity: 1; }
        }

        .jarvis-orb { position: relative; display: inline-block; }
        .jarvis-orb .orb-outer {
          transform-origin: 100px 100px;
          animation: orb-spin 30s linear infinite;
        }
        .jarvis-orb .orb-arc {
          transform-origin: 100px 100px;
          animation: orb-spin-reverse 12s linear infinite;
        }
        .jarvis-orb .orb-core {
          transform-origin: center;
          animation: orb-core-breathe 4s ease-in-out infinite;
        }

        .jarvis-orb.orb-speaking .orb-core { animation: orb-core-speak 0.7s ease-in-out infinite; }
        .jarvis-orb.orb-speaking .orb-outer { animation-duration: 8s; }
        .jarvis-orb.orb-speaking .orb-arc { animation-duration: 4s; }

        .jarvis-orb.orb-listening .orb-core { animation: orb-core-listen 1.2s ease-in-out infinite; }
        .jarvis-orb.orb-listening .orb-outer { animation-duration: 15s; }

        .jarvis-orb.orb-processing .orb-arc { animation-duration: 1.5s; }

        /* Position absolue de l'orb : centré horizontalement, fixe verticalement sous le header */
        .orb-stage {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin-top: 0.5rem;
          transition: all 0.5s ease;
        }
      `}</style>

      {/* Background atmosphérique */}
      <div className="absolute inset-0 bg-grid opacity-60 pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: 'radial-gradient(circle at 50% 30%, rgba(91,158,255,0.08), transparent 60%)' }} />
      <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#5b9eff]/30 to-transparent scan-line pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6">
            <JarvisOrb state={orbState} size={24} />
          </div>
          <span className={`font-mono text-xs uppercase tracking-[0.3em] ${
            isJarvisSpeaking ? 'text-[#5b9eff] glow-text' :
            isListening ? 'text-[#5b9eff]' :
            isProcessing ? '' : 'text-[#6b6b78]'
          }`}>
            {isProcessing ? <span className="shimmer-text">{statusLabel}</span> : statusLabel}
          </span>
        </div>

        <h1 className="font-display text-2xl tracking-wide italic glow-text">Jarvis</h1>

        <button onClick={() => setShowSettings(true)}
                className="p-2 rounded-full hover:bg-white/5 transition-colors text-[#6b6b78] hover:text-[#e8e8ec]"
                aria-label="Paramètres">
          <Settings size={18} strokeWidth={1.5} />
        </button>
      </header>

      {/* Zone principale */}
      <main className="relative z-10 flex flex-col items-center px-6 pb-48 pt-2 max-w-5xl mx-auto min-h-[calc(100vh-200px)]">
        {/* Orb XL toujours visible - taille responsive selon viewport */}
        <div className="orb-stage">
          <JarvisOrb state={orbState} size={orbSize} />
          {isEmpty && (
            <>
              <p className="font-display text-3xl italic mt-6 mb-2">Bonsoir, {auth.user.name}.</p>
              <p className="font-mono text-xs text-[#6b6b78] tracking-wider uppercase">
                Appuyez sur le micro pour me parler
              </p>
            </>
          )}
        </div>

        {/* Affichage des 2 dernières discussions (4 messages max) */}
        <div className="w-full max-w-3xl mx-auto space-y-4 mt-6">
          {visibleMessages.map((m, i) => (
            <div key={`${m.ts}-${i}`} className={`flex msg-in ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#6b6b78] mb-2">
                  {m.role === 'user' ? auth.user.name : '— Jarvis'}
                </div>
                <div className={`inline-block px-5 py-3 rounded-2xl text-[15px] leading-relaxed
                  ${m.role === 'user'
                    ? 'bg-[#5b9eff]/10 border border-[#5b9eff]/20 text-[#e8e8ec]'
                    : 'bg-white/[0.03] border border-white/5 font-display italic text-[17px]'}`}>
                  {m.content}
                </div>
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex justify-start msg-in">
              <div className="max-w-[80%]">
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#6b6b78] mb-2">— Jarvis</div>
                <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/[0.03] border border-white/5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5b9eff] animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5b9eff] animate-pulse" style={{ animationDelay: '0.2s' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5b9eff] animate-pulse" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div ref={messagesEndRef} />
      </main>

      {/* Barre micro fixe */}
      <div className="fixed bottom-0 inset-x-0 z-20 pb-10 pt-8 pointer-events-none"
           style={{ background: 'linear-gradient(to top, #06060a 60%, transparent)' }}>
        <div className="max-w-3xl mx-auto px-6 flex flex-col items-center gap-6 pointer-events-auto">
          {isListening && liveTranscript && (
            <div className="font-mono text-sm text-[#e8e8ec] text-center max-w-2xl px-4">
              {liveTranscript}
              <span className="cursor-blink text-[#5b9eff] ml-1">▊</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-300 font-mono text-xs">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <div className="relative flex items-center justify-center">
            {isListening && (
              <>
                <div className="absolute w-20 h-20 rounded-full border border-[#5b9eff] pulse-ring" />
                <div className="absolute w-20 h-20 rounded-full border border-[#5b9eff] pulse-ring-2" />
                <div className="absolute w-20 h-20 rounded-full border border-[#5b9eff] pulse-ring-3" />
              </>
            )}
            <button
              onClick={toggleListening}
              disabled={isProcessing}
              className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed
                ${isListening
                  ? 'bg-[#5b9eff] glow-accent scale-110'
                  : 'bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#5b9eff]/40'}`}
              aria-label={isListening ? 'Arrêter' : 'Démarrer'}
            >
              <Mic size={28} strokeWidth={1.5} className={isListening ? 'text-[#06060a]' : 'text-[#e8e8ec]'} />
            </button>
          </div>

          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#6b6b78]">
            {isListening ? 'cliquez pour arrêter' :
             isJarvisSpeaking ? 'cliquez pour interrompre' :
             isProcessing ? '...' : 'cliquez pour parler'}
          </p>
        </div>
      </div>

      {/* Modal Settings */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm msg-in"
          onClick={() => setShowSettings(false)}
        >
          <div className="relative w-full max-w-md bg-[#0e0e12] border border-white/10 rounded-2xl p-8"
               onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowSettings(false)}
                    className="absolute top-4 right-4 text-[#6b6b78] hover:text-[#e8e8ec]">
              <X size={20} />
            </button>

            <h2 className="font-display text-2xl italic mb-1">Configuration</h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#6b6b78] mb-8">
              voix · session
            </p>

            <div className="space-y-5">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[#6b6b78] mb-2">
                  ElevenLabs API Key <span className="text-[#3a3a44]">(optionnel)</span>
                </label>
                <input
                  type="password" value={elevenlabsKey}
                  onChange={(e) => setElevenlabsKey(e.target.value)}
                  placeholder="sk_..."
                  className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 focus:border-[#5b9eff]/50 focus:outline-none font-mono text-sm text-[#e8e8ec] placeholder-[#3a3a44]"
                />
                <p className="font-mono text-[10px] text-[#6b6b78] mt-2">
                  Sans clé : voix navigateur. Avec clé : voix "George" (UK posh, vibe Jarvis).
                </p>
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[#6b6b78] mb-2">
                  Voice ID
                </label>
                <input
                  type="text" value={elevenlabsVoiceId}
                  onChange={(e) => setElevenlabsVoiceId(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 focus:border-[#5b9eff]/50 focus:outline-none font-mono text-sm text-[#e8e8ec]"
                />
                <p className="font-mono text-[10px] text-[#6b6b78] mt-2">
                  George (UK, défaut) · Daniel: onwK4e9ZLuTAKqWW03F9 · Adam: pNInz6obpgDQGcFmaJgB
                </p>
              </div>

              <div className="pt-4 border-t border-white/5 space-y-2">
                <p className="font-mono text-[10px] text-[#6b6b78]">
                  Connecté en tant que <span className="text-[#e8e8ec]">{auth.user.name}</span> ({auth.user.email})
                </p>
                <button
                  onClick={() => { setShowSettings(false); onLogout() }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 transition-colors font-mono text-xs uppercase tracking-[0.2em]"
                >
                  <LogOut size={14} />
                  Déconnexion
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}