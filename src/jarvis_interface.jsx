import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, Send, Settings, X, AlertCircle, LogOut, Clock, Bell, BellOff, LayoutDashboard } from 'lucide-react'
import { Link } from 'react-router-dom'
import WalleAvatar from './WalleAvatar'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Voice Wall-E par defaut (timbre créé par mes soins sur ElevenLabs)
const DEFAULT_VOICE_ID = 'pzMUt9WXzANV4Hu6SUkA'

// Presets voice_settings ElevenLabs - effet enfantin/joueur
const VOICE_SETTINGS = {
  stability: 0.35,
  similarity_boost: 0.85,
  style: 0.5,
  use_speaker_boost: true,
  speed: 1.20
}

// Reduit a 8 messages visibles
const VISIBLE_MESSAGES = 8

const prefsKey = (userId) => `jarvis_prefs_${userId}`
const eventsKey = (userId) => `jarvis_events_${userId}`

// Pattern d'etoiles pour le fond spatial - 18 etoiles reparties dans une tuile
// Tons varies : blanc neutre, blanc-bleute, ambre tres clair pour donner de la profondeur
const STARS_BG = `
  radial-gradient(1.5px 1.5px at 8% 12%, #ffffff, transparent),
  radial-gradient(1px 1px at 22% 28%, #ffffff, transparent),
  radial-gradient(2px 2px at 42% 18%, #ffe5b5, transparent),
  radial-gradient(1px 1px at 58% 38%, #c4d0ff, transparent),
  radial-gradient(1.5px 1.5px at 71% 22%, #ffffff, transparent),
  radial-gradient(1px 1px at 86% 48%, #ffffff, transparent),
  radial-gradient(2px 2px at 94% 18%, #ffe5b5, transparent),
  radial-gradient(1px 1px at 14% 62%, #ffffff, transparent),
  radial-gradient(1.5px 1.5px at 32% 78%, #c4d0ff, transparent),
  radial-gradient(1px 1px at 48% 88%, #ffffff, transparent),
  radial-gradient(2px 2px at 62% 68%, #ffffff, transparent),
  radial-gradient(1px 1px at 78% 82%, #ffe5b5, transparent),
  radial-gradient(1.5px 1.5px at 88% 72%, #ffffff, transparent),
  radial-gradient(1px 1px at 6% 92%, #c4d0ff, transparent),
  radial-gradient(1px 1px at 38% 52%, #ffffff, transparent),
  radial-gradient(1.5px 1.5px at 96% 90%, #ffffff, transparent),
  radial-gradient(1px 1px at 52% 8%, #ffffff, transparent),
  radial-gradient(2px 2px at 25% 45%, #ffffff, transparent)
`.replace(/\s+/g, ' ').trim()

function audioExtFromMime(mimeType) {
  if (!mimeType) return 'webm'
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4')) return 'mp4'
  return 'webm'
}

function formatRemaining(ms) {
  if (ms <= 0) return '0:00'
  const totalSec = Math.ceil(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatAlarmTime(ts) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}h${d.getMinutes().toString().padStart(2, '0')}`
}

export default function JarvisInterface({ auth, onLogout }) {
  const [messages, setMessages] = useState([])
  const [isListening, setIsListening] = useState(false)        // gros micro : enregistre + envoie
  const [isDictating, setIsDictating] = useState(false)        // petit micro : enregistre + met dans le champ
  const [isProcessing, setIsProcessing] = useState(false)
  const [isJarvisSpeaking, setIsJarvisSpeaking] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState(null)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  // Taille de l'avatar - environ 2x plus grande qu'avant (plafond passe de 600 a 1100)
  const [orbSize, setOrbSize] = useState(900)

  // Champ texte pour ecrire (ou y dicter via le petit micro)
  const [inputText, setInputText] = useState('')

  const [elevenlabsKey, setElevenlabsKey] = useState('')
  const [elevenlabsVoiceId, setElevenlabsVoiceId] = useState(DEFAULT_VOICE_ID)

  const [events, setEvents] = useState([])
  const [notification, setNotification] = useState(null)
  const [now, setNow] = useState(Date.now())

  const [notifPermission, setNotifPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  )

  const messagesEndRef = useRef(null)
  const audioRef = useRef(null)
  const audioCtxRef = useRef(null)
  const audioSourceRef = useRef(null)
  const beepIntervalRef = useRef(null)

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const mediaStreamRef = useRef(null)
  // Memorise le mode du recorder actif ('send' = gros mic, 'dictate' = petit mic)
  const recordModeRef = useRef('send')

  useEffect(() => {
    const computeOrbSize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      // Coefs augmentes pour avoir un avatar ~2x plus grand qu'avant
      // Plafond a 1100 (vs 600 avant)
      const max = Math.min(w * 0.9, h * 0.85, 1100)
      setOrbSize(Math.max(440, Math.floor(max)))
    }
    computeOrbSize()
    window.addEventListener('resize', computeOrbSize)
    return () => window.removeEventListener('resize', computeOrbSize)
  }, [])

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

  useEffect(() => {
    const stored = localStorage.getItem(eventsKey(auth.user.id))
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        const t = Date.now()
        setEvents(parsed.filter(e => e.firesAt > t))
      } catch {}
    }
  }, [auth.user.id])

  useEffect(() => {
    localStorage.setItem(eventsKey(auth.user.id), JSON.stringify(events))
  }, [events, auth.user.id])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      mediaStreamRef.current?.getTracks().forEach(t => t.stop())
      if (beepIntervalRef.current) clearInterval(beepIntervalRef.current)
    }
  }, [])

  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices()
    }
  }, [])

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

  const requestNotifPermission = async () => {
    if (!('Notification' in window)) return
    if (Notification.permission !== 'default') return
    try {
      const result = await Notification.requestPermission()
      setNotifPermission(result)
    } catch (e) {}
  }

  const sendSystemNotification = (message) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const [titlePart, ...bodyParts] = message.split(' : ')
    const body = bodyParts.length > 0
      ? bodyParts.join(' : ')
      : 'Reviens sur Walle pour arreter la sonnerie'
    try {
      const notif = new Notification(`Walle — ${titlePart}`, {
        body,
        tag: 'walle-alarm',
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200]
      })
      notif.onclick = () => {
        window.focus()
        notif.close()
      }
    } catch (e) {}
  }

  const playBeep = () => {
    const ctx = audioCtxRef.current
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})

    const start = ctx.currentTime
    for (let i = 0; i < 3; i++) {
      const t = start + i * 0.4
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      osc.type = 'sine'
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.3, t + 0.02)
      gain.gain.linearRampToValueAtTime(0, t + 0.3)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.3)
    }
  }

  const startBeepLoop = () => {
    if (beepIntervalRef.current) clearInterval(beepIntervalRef.current)
    playBeep()
    beepIntervalRef.current = setInterval(playBeep, 2200)
  }

  const stopBeepLoop = () => {
    if (beepIntervalRef.current) {
      clearInterval(beepIntervalRef.current)
      beepIntervalRef.current = null
    }
  }

  const fireNotification = (message) => {
    startBeepLoop()
    setNotification(message)
    sendSystemNotification(message)
  }

  const dismissNotification = () => {
    stopBeepLoop()
    setNotification(null)
  }

  useEffect(() => {
    const tick = () => {
      const t = Date.now()
      setNow(t)
      setEvents(prev => {
        const due = prev.filter(e => e.firesAt <= t)
        if (due.length === 0) return prev
        due.forEach(e => {
          const base = e.type === 'timer' ? 'Minuteur termine' : 'Alarme'
          fireNotification(`${base}${e.label ? ` : ${e.label}` : ''}`)
        })
        return prev.filter(e => e.firesAt > t)
      })
    }
    const intervalId = setInterval(tick, 1000)
    return () => clearInterval(intervalId)
  }, [])

  const addTimer = (durationSeconds, label) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const firesAt = Date.now() + durationSeconds * 1000
    setEvents(prev => [...prev, { id, type: 'timer', firesAt, label: label || null }])
  }

  const addAlarm = (hour, minute, label) => {
    const target = new Date()
    target.setHours(hour, minute || 0, 0, 0)
    if (target <= new Date()) target.setDate(target.getDate() + 1)
    const id = `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    setEvents(prev => [...prev, { id, type: 'alarm', firesAt: target.getTime(), label: label || null }])
  }

  const cancelEvent = (id) => {
    setEvents(prev => prev.filter(e => e.id !== id))
  }

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
    const audio = audioRef.current || new Audio()
    audioRef.current = audio
    audio.pause()
    audio.volume = 1
    audio.src = url
    audio.onplay = () => setIsJarvisSpeaking(true)
    audio.onended = () => setIsJarvisSpeaking(false)
    audio.onerror = () => {
      setIsJarvisSpeaking(false)
      const code = audio.error?.code
      setError(`audio.onerror code=${code || '?'}`)
    }
    const playPromise = audio.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(err => {
        setIsJarvisSpeaking(false)
        setError(`play() bloque: ${err.name} - ${(err.message || '').slice(0, 80)}`)
      })
    }
  }

  const playWithAudioContext = async (blob) => {
    const ctx = audioCtxRef.current
    if (!ctx) {
      playAudioUrl(URL.createObjectURL(blob))
      return
    }
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop() } catch {}
      audioSourceRef.current = null
    }
    if (ctx.state === 'suspended') {
      try { await ctx.resume() } catch {}
    }
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      setIsJarvisSpeaking(true)
      source.onended = () => {
        setIsJarvisSpeaking(false)
        if (audioSourceRef.current === source) audioSourceRef.current = null
      }
      audioSourceRef.current = source
      source.start(0)
    } catch (err) {
      setIsJarvisSpeaking(false)
      setError(`Web Audio: ${err.name} - ${(err.message || '').slice(0, 80)}`)
    }
  }

  const synthesizeElevenLabs = async (text) => {
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenlabsVoiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': elevenlabsKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: VOICE_SETTINGS
        })
      })
      if (!res.ok) throw new Error(`ElevenLabs ${res.status}`)
      const blob = await res.blob()

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      if (isIOS) {
        await playWithAudioContext(blob)
      } else {
        playAudioUrl(URL.createObjectURL(blob))
      }
    } catch (err) {
      console.warn('TTS ElevenLabs echec, fallback navigateur:', err.message)
      speakWithBrowser(text)
    }
  }

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
      const reply = data.reply || "Pas de reponse recue."
      setMessages(prev => [...prev, { role: 'jarvis', content: reply, ts: Date.now() }])

      if (data.timer) addTimer(data.timer.duration_seconds, data.timer.label)
      if (data.alarm) addAlarm(data.alarm.hour, data.alarm.minute, data.alarm.label)

      if (elevenlabsKey) await synthesizeElevenLabs(reply)
      else speakWithBrowser(reply)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsProcessing(false)
    }
  }, [auth.token, elevenlabsKey, elevenlabsVoiceId, onLogout])

  // Refactor : startRecording accepte un mode ('send' = gros mic, 'dictate' = petit mic)
  // C'est le mode qui decide ce qu'on fait du blob une fois l'enregistrement fini
  const startRecording = async (mode = 'send') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      recordModeRef.current = mode

      const mr = new MediaRecorder(stream)
      audioChunksRef.current = []

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mr.onstop = async () => {
        mediaStreamRef.current?.getTracks().forEach(t => t.stop())
        mediaStreamRef.current = null
        const mime = mr.mimeType || 'audio/webm'
        const blob = new Blob(audioChunksRef.current, { type: mime })
        audioChunksRef.current = []
        const ext = audioExtFromMime(mime)

        if (blob.size < 500) {
          setError('Enregistrement trop court')
          if (recordModeRef.current === 'send') setIsProcessing(false)
          else setIsDictating(false)
          return
        }

        if (recordModeRef.current === 'send') {
          await transcribeAndSend(blob, ext)
        } else {
          await transcribeToField(blob, ext)
        }
      }

      mediaRecorderRef.current = mr
      mr.start()
      if (mode === 'send') setIsListening(true)
      else setIsDictating(true)
    } catch (err) {
      setError(`Micro inaccessible : ${err.message || err.name}`)
      setIsListening(false)
      setIsDictating(false)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
      if (recordModeRef.current === 'send') {
        setIsListening(false)
        setIsProcessing(true)
      }
      // pour 'dictate' : isDictating reste true jusqu'a la fin de la transcription
    }
  }

  // Gros mic : transcrit + envoie direct au backend
  const transcribeAndSend = async (audioBlob, ext) => {
    try {
      const form = new FormData()
      form.append('audio', audioBlob, `voice.${ext}`)
      const res = await fetch(`${API_URL}/transcribe`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth.token}` },
        body: form
      })
      if (res.status === 401) { onLogout(); return }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Transcription HTTP ${res.status}`)
      }
      const { text } = await res.json()
      if (!text?.trim()) {
        setError("Je n'ai rien entendu, reessaie en parlant plus distinctement")
        setIsProcessing(false)
        return
      }
      await sendToBackend(text)
    } catch (err) {
      setError(err.message)
      setIsProcessing(false)
    }
  }

  // Petit mic : transcrit et met le texte DANS le champ (sans envoyer, Kat peut corriger)
  const transcribeToField = async (audioBlob, ext) => {
    try {
      const form = new FormData()
      form.append('audio', audioBlob, `voice.${ext}`)
      const res = await fetch(`${API_URL}/transcribe`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth.token}` },
        body: form
      })
      if (res.status === 401) { onLogout(); return }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Transcription HTTP ${res.status}`)
      }
      const { text } = await res.json()
      if (!text?.trim()) {
        setError("Je n'ai rien entendu, reessaie en parlant plus distinctement")
        return
      }
      // Append si le champ a deja du texte, sinon remplace
      setInputText(prev => prev.trim() ? `${prev.trim()} ${text.trim()}` : text.trim())
    } catch (err) {
      setError(err.message)
    } finally {
      setIsDictating(false)
    }
  }

  const unlockAudioIOS = () => {
    if (audioCtxRef.current) return
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (Ctx) {
        const ctx = new Ctx()
        if (ctx.state === 'suspended') ctx.resume().catch(() => {})
        const buffer = ctx.createBuffer(1, 1, 22050)
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)
        source.start(0)
        audioCtxRef.current = ctx
      }
    } catch (e) {}
    if (!audioRef.current) {
      const a = new Audio()
      a.play().catch(() => {})
      audioRef.current = a
    }
  }

  // Coupe la voix en cours + unlock iOS - utilise par toggleListening, toggleDictating ET handleTextSubmit
  const prepareForUserInput = () => {
    setError(null)
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    if (audioRef.current) audioRef.current.pause()
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop() } catch {}
      audioSourceRef.current = null
    }
    setIsJarvisSpeaking(false)
    unlockAudioIOS()
    requestNotifPermission()
  }

  const toggleListening = () => {
    if (isListening) {
      stopRecording()
    } else {
      // bloquer si dictee en cours
      if (isDictating || isProcessing) return
      prepareForUserInput()
      startRecording('send')
    }
  }

  // Petit micro de dictee : enregistre + met le texte dans le champ
  const toggleDictating = () => {
    if (isDictating) {
      stopRecording()
    } else {
      // bloquer si gros micro en cours ou traitement
      if (isListening || isProcessing) return
      prepareForUserInput()
      startRecording('dictate')
    }
  }

  const handleTextSubmit = () => {
    const text = inputText.trim()
    if (!text) return
    if (isProcessing || isListening || isDictating) return
    prepareForUserInput()
    setInputText('')
    sendToBackend(text)
  }

  // Enter envoie, Shift+Enter laisse la ligne (au cas ou multiligne plus tard)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleTextSubmit()
    }
  }

  const orbState = isJarvisSpeaking ? 'speaking'
                 : isListening ? 'listening'
                 : isProcessing ? 'processing'
                 : 'idle'

  const statusLabel = isJarvisSpeaking ? 'walle parle'
                    : isListening ? 'ecoute active'
                    : isDictating ? 'dictee en cours'
                    : isProcessing ? 'traitement'
                    : `bonjour ${auth.user.name.toLowerCase()}`

  const isEmpty = historyLoaded && messages.length === 0 && !isProcessing
  const visibleMessages = messages.slice(-VISIBLE_MESSAGES)

  // Desactive l'input texte pendant l'enregistrement vocal (gros mic) ou le traitement
  // Reste actif pendant la dictee pour qu'on puisse voir le texte arriver
  const textInputDisabled = isListening || isProcessing
  const canSend = inputText.trim().length > 0 && !textInputDisabled && !isDictating

  // Placeholder qui s'adapte au contexte
  const inputPlaceholder =
    isListening ? 'micro actif...' :
    isDictating ? 'je t\'ecoute, parle...' :
    isProcessing ? 'traitement...' :
    'ecris a walle'

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#040410] text-[#e8e8ec]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@300;400;500&display=swap');
        .font-display { font-family: 'Instrument Serif', serif; font-weight: 400; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }

        @keyframes pulse-ring { 0% { transform: scale(0.9); opacity: 0.7; } 100% { transform: scale(2.2); opacity: 0; } }
        .pulse-ring { animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        .pulse-ring-2 { animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; animation-delay: 0.6s; }
        .pulse-ring-3 { animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; animation-delay: 1.2s; }

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

        @keyframes alarm-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
        .alarm-pulse { animation: alarm-pulse 1s ease-in-out infinite; }

        @keyframes dictate-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .dictate-pulse { animation: dictate-pulse 1.2s ease-in-out infinite; }

        .glow-accent { box-shadow: 0 0 40px rgba(91,158,255,0.4), inset 0 0 20px rgba(91,158,255,0.1); }
        .glow-text { text-shadow: 0 0 20px rgba(91,158,255,0.5); }

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

      {/* Fond spatial - tuile d'etoiles repetee */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: STARS_BG,
        backgroundSize: '900px 700px',
        backgroundRepeat: 'repeat'
      }} />

      {/* Halo nebuleux discret */}
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: 'radial-gradient(circle at 50% 30%, rgba(91,158,255,0.06), transparent 60%)' }} />

      {/* Lune sur le cote gauche */}
      <div className="absolute pointer-events-none" style={{ left: '60px', top: '140px', width: '200px', height: '200px', zIndex: 1 }}>
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <defs>
            <radialGradient id="moonGlow">
              <stop offset="40%" stopColor="#fff8e7" stopOpacity="0.35" />
              <stop offset="75%" stopColor="#fff8e7" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#fff8e7" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="moonBody" cx="40%" cy="40%">
              <stop offset="0%" stopColor="#fff8e7" />
              <stop offset="100%" stopColor="#c8c4b4" />
            </radialGradient>
          </defs>
          {/* Halo lumineux */}
          <circle cx="50" cy="50" r="48" fill="url(#moonGlow)" />
          {/* Corps de la lune */}
          <circle cx="50" cy="50" r="32" fill="url(#moonBody)" />
          {/* Crateres */}
          <circle cx="38" cy="42" r="5" fill="#a8a494" opacity="0.55" />
          <circle cx="58" cy="56" r="3" fill="#a8a494" opacity="0.5" />
          <circle cx="48" cy="65" r="3" fill="#a8a494" opacity="0.5" />
          <circle cx="62" cy="38" r="4" fill="#b8b4a4" opacity="0.4" />
          <circle cx="35" cy="58" r="2" fill="#a8a494" opacity="0.5" />
          <circle cx="55" cy="72" r="2" fill="#b8b4a4" opacity="0.4" />
          <circle cx="42" cy="50" r="1.5" fill="#a8a494" opacity="0.4" />
        </svg>
      </div>

      {notification && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-full bg-[#5b9eff] text-[#06060a] font-mono text-sm font-medium msg-in shadow-2xl alarm-pulse">
          <Bell size={16} />
          <span>{notification}</span>
          <button onClick={dismissNotification} className="ml-2 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6">
            <WalleAvatar state={orbState} size={24} />
          </div>
          <span className={`font-mono text-xs uppercase tracking-[0.3em] ${
            isJarvisSpeaking ? 'text-[#5b9eff] glow-text' :
            isListening ? 'text-[#5b9eff]' :
            isDictating ? 'text-red-300' :
            isProcessing ? '' : 'text-[#6b6b78]'
          }`}>
            {isProcessing ? <span className="shimmer-text">{statusLabel}</span> : statusLabel}
          </span>
        </div>

        {/* Titre principal - nouveau message Wall-E */}
        <h1 className="font-display text-lg md:text-xl tracking-wide italic glow-text text-center px-4">
          Coucou, je suis Walle - Mecanum intelligent
        </h1>

        <div className="flex items-center gap-1">
            {[1, 2].includes(auth.user.id) && (
              <Link
                to="/admin"
                className="p-2 rounded-full hover:bg-white/5 transition-colors text-[#6b6b78] hover:text-[#5b9eff]"
                aria-label="Mode admin"
                title="Tableau de bord admin"
              >
                <LayoutDashboard size={18} strokeWidth={1.5} />
              </Link>
            )}
            <button onClick={() => setShowSettings(true)}
                    className="p-2 rounded-full hover:bg-white/5 transition-colors text-[#6b6b78] hover:text-[#e8e8ec]"
                    aria-label="Parametres">
              <Settings size={18} strokeWidth={1.5} />
            </button>
          </div>
               
      </header>

      <main className="relative z-10 flex flex-col items-center px-6 pb-48 pt-2 max-w-6xl mx-auto min-h-[calc(100vh-200px)]">
        <div className="orb-stage">
          <WalleAvatar state={orbState} size={orbSize} />
          {isEmpty && (
            <>
              <p className="font-display text-3xl italic mt-6 mb-2">Bonsoir, {auth.user.name}.</p>
              <p className="font-mono text-xs text-[#6b6b78] tracking-wider uppercase">
                Ecris-moi ou appuie sur le micro
              </p>
            </>
          )}
        </div>

        <div className="w-full max-w-3xl mx-auto space-y-4 mt-6">
          {visibleMessages.map((m, i) => (
            <div key={`${m.ts}-${i}`} className={`flex msg-in ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#6b6b78] mb-2">
                  {m.role === 'user' ? auth.user.name : '— Walle'}
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
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#6b6b78] mb-2">— Walle</div>
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

      {events.length > 0 && (
        <div className="fixed bottom-44 left-6 z-30 space-y-2 max-w-[280px]">
          {events.map(e => (
            <div key={e.id}
                 className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm font-mono text-xs text-[#e8e8ec]">
              {e.type === 'timer'
                ? <Clock size={12} className="text-[#5b9eff] flex-shrink-0" />
                : <Bell size={12} className="text-[#5b9eff] flex-shrink-0" />}
              <span className="text-[#5b9eff] tabular-nums">
                {e.type === 'timer' ? formatRemaining(e.firesAt - now) : formatAlarmTime(e.firesAt)}
              </span>
              {e.label && <span className="truncate text-[#6b6b78]">· {e.label}</span>}
              <button onClick={() => cancelEvent(e.id)}
                      className="ml-auto text-[#6b6b78] hover:text-red-300 flex-shrink-0"
                      aria-label="Annuler">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="fixed bottom-0 inset-x-0 z-20 pb-10 pt-8 pointer-events-none"
           style={{ background: 'linear-gradient(to top, #040410 60%, transparent)' }}>
        <div className="max-w-3xl mx-auto px-6 flex flex-col items-center gap-4 pointer-events-auto">
          {isListening && (
            <div className="font-mono text-sm text-[#5b9eff] text-center">
              Enregistrement
              <span className="cursor-blink text-[#5b9eff] ml-1">▊</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-300 font-mono text-xs">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Champ texte + petit mic de dictee (a l'interieur du champ, a droite) + bouton Send */}
          <div className="w-full max-w-xl flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={textInputDisabled}
                placeholder={inputPlaceholder}
                className="w-full pl-5 pr-12 py-3 rounded-full bg-white/5 border border-white/10 focus:border-[#5b9eff]/50 focus:outline-none font-mono text-sm text-[#e8e8ec] placeholder-[#3a3a44] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Ecrire un message"
              />
              {/* Petit micro de dictee a droite du champ */}
              <button
                onClick={toggleDictating}
                disabled={isListening || isProcessing}
                className={`absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center transition-all
                  ${isDictating
                    ? 'bg-red-500/25 border border-red-500/60 dictate-pulse'
                    : 'hover:bg-white/10 border border-transparent'}
                  disabled:opacity-30 disabled:cursor-not-allowed`}
                aria-label={isDictating ? 'Arreter la dictee' : 'Dicter dans le champ'}
                title={isDictating ? 'Stop dictee' : 'Dicter (la voix sera transcrite dans le champ)'}
              >
                <Mic size={16} strokeWidth={1.5} className={isDictating ? 'text-red-300' : 'text-[#6b6b78]'} />
              </button>
            </div>
            <button
              onClick={handleTextSubmit}
              disabled={!canSend}
              className="w-12 h-12 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#5b9eff]/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
              aria-label="Envoyer le message"
            >
              <Send size={20} strokeWidth={1.5} className="text-[#e8e8ec]" />
            </button>
          </div>

          {/* Gros micro principal (record + envoie direct) */}
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
              disabled={isProcessing || isDictating}
              className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed
                ${isListening
                  ? 'bg-[#5b9eff] glow-accent scale-110'
                  : 'bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#5b9eff]/40'}`}
              aria-label={isListening ? 'Arreter' : 'Demarrer'}
            >
              <Mic size={28} strokeWidth={1.5} className={isListening ? 'text-[#06060a]' : 'text-[#e8e8ec]'} />
            </button>
          </div>

          {notification && (
            <button
              onClick={dismissNotification}
              className="flex items-center gap-2 px-5 py-3 rounded-full bg-red-500/20 border border-red-500/40 hover:bg-red-500/30 text-red-300 font-mono text-xs uppercase tracking-[0.2em] msg-in alarm-pulse"
            >
              <BellOff size={14} />
              Arreter la sonnerie
            </button>
          )}

          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#6b6b78]">
            {isListening ? 'cliquez pour arreter' :
             isDictating ? 'cliquez sur le petit mic pour stopper la dictee' :
             isJarvisSpeaking ? 'cliquez pour interrompre' :
             isProcessing ? '...' : 'ecris, dicte (petit mic), ou parle (gros mic)'}
          </p>
        </div>
      </div>

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
              voix · session · notifications
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
                  Sans cle : voix navigateur. Avec cle : voix Walle (enfantine, joueuse).
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
                  Walle (defaut) · Adam: pNInz6obpgDQGcFmaJgB · Daniel: onwK4e9ZLuTAKqWW03F9
                </p>
              </div>

              <div className="pt-4 border-t border-white/5">
                <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[#6b6b78] mb-2">
                  Notifications systeme
                </label>
                <div className="px-4 py-3 rounded-lg bg-black/40 border border-white/10 font-mono text-xs">
                  {notifPermission === 'granted' && <span className="text-green-400">Activees - tu seras prevenue meme onglet en arriere-plan</span>}
                  {notifPermission === 'denied' && <span className="text-red-300">Bloquees - autorise-les dans les reglages du navigateur pour ce site</span>}
                  {notifPermission === 'default' && <span className="text-[#6b6b78]">Pas encore demandees - clique sur le micro pour activer</span>}
                  {notifPermission === 'unsupported' && <span className="text-[#6b6b78]">Non supportees par ce navigateur</span>}
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 space-y-2">
                <p className="font-mono text-[10px] text-[#6b6b78]">
                  Connecte en tant que <span className="text-[#e8e8ec]">{auth.user.name}</span> ({auth.user.email})
                </p>
                <button
                  onClick={() => { setShowSettings(false); onLogout() }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 transition-colors font-mono text-xs uppercase tracking-[0.2em]"
                >
                  <LogOut size={14} />
                  Deconnexion
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}