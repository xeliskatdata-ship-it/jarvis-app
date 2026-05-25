// Service Whisper - transcription audio via Groq
// Modèle turbo : 7x plus rapide que whisper-large-v3 standard, qualité quasi identique
// Limite Groq : 25 Mo par fichier, formats webm/mp3/wav/m4a/ogg/flac/mp4

const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const WHISPER_MODEL = 'whisper-large-v3-turbo'

export async function transcribe(audioBuffer, { filename = 'audio.webm', language = 'fr' } = {}) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY manquante')
  if (!audioBuffer?.length) throw new Error('Audio vide')

  // Blob et FormData natifs depuis Node 18 - pas besoin de form-data npm
  const blob = new Blob([audioBuffer])
  const form = new FormData()
  form.append('file', blob, filename)
  form.append('model', WHISPER_MODEL)
  form.append('language', language) // force le français, évite les mauvaises détections

  const res = await fetch(GROQ_TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Groq Whisper ${res.status}: ${errBody.slice(0, 200)}`)
  }

  const { text } = await res.json()
  return text?.trim() || ''
}