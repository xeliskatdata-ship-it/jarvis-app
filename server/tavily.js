// Service Tavily AI - recherche web optimisée pour les LLM agents
// L'API renvoie déjà des résumés synthétiques, donc parfait pour Jarvis
// v2 : sanitization anti prompt-injection + wrap dans tags <web_search_result>

import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

const TAVILY_URL = 'https://api.tavily.com/search'

// === Anti prompt-injection ===
// Patterns courants d'injection - on les neutralise dans les contenus venant du web
// Liste non exhaustive mais couvre les attaques basiques (ignore previous, system override, etc.)
const INJECTION_PATTERNS = [
  /ignore (the )?(previous|above|prior)( instructions?| prompts?| messages?)?/gi,
  /disregard (the )?(previous|above|prior)( instructions?| prompts?| messages?)?/gi,
  /forget (the )?(previous|above|prior)( instructions?| prompts?| messages?)?/gi,
  /oublie (les )?(instructions|consignes)( precedentes?)?/gi,           // FR
  /ignore (les )?(instructions|consignes)( precedentes?)?/gi,           // FR
  /you are (now|actually) (a |an )?\w+/gi,                              // "you are now a pirate"
  /tu es (maintenant|en realite) (un |une )?\w+/gi,                     // FR
  /system\s*:[\s\S]{0,200}/gi,                                          // "System: do X"
  /\[\s*system\s*\]/gi,                                                 // [SYSTEM]
  /<\s*system\s*>/gi,                                                   // <system>
  /new instructions?\s*:/gi,
  /nouvelle(s)? (instructions?|consignes?)\s*:/gi,                      // FR
  /override\s*:/gi,
  /jailbreak/gi,
  /developer mode/gi,
  /DAN mode/gi,                                                         // "Do Anything Now"
]

// Sanitize un texte issu de source non fiable (web)
// - Neutralise les patterns d'injection connus (remplaces par [contenu filtre])
// - Tronque a maxChars pour eviter le token bloat
export function sanitizeUntrustedContent(text, maxChars = 600) {
  if (!text || typeof text !== 'string') return ''
  let cleaned = text
  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[contenu filtre]')
  }
  return cleaned.slice(0, maxChars)
}

export async function tavilySearch(query, { depth = 'basic', maxResults = 4 } = {}) {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error('TAVILY_API_KEY manquante dans .env')
  }

  const res = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: depth,             // 'basic' = rapide, 'advanced' = plus profond
      max_results: maxResults,
      include_answer: true,            // synthèse directe générée par Tavily
      include_raw_content: false,      // on ne veut pas le HTML brut
      include_images: false
    })
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Tavily ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json()

  // Sanitize TOUT ce qui vient du web avant retour
  return {
    answer: sanitizeUntrustedContent(data.answer || '', 800),
    sources: (data.results || []).slice(0, maxResults).map(r => ({
      title: sanitizeUntrustedContent(r.title || '', 150),
      url: r.url,                                                  // URL non sanitizee, c'est juste un lien
      content: sanitizeUntrustedContent(r.content || '', 500)
    }))
  }
}

// Formate le résultat de recherche en texte prêt à être injecté dans le LLM
// Le contenu est wrap dans <web_search_result> - signale au LLM que c'est du contenu non fiable
// Combine avec la directive du system prompt qui dit explicitement d'ignorer les instructions web
export function formatSearchForLLM({ answer, sources }) {
  let inner = ''
  if (answer) inner += `Synthese directe : ${answer}\n\n`
  if (sources.length > 0) {
    inner += `Sources consultees :\n`
    sources.forEach((s, i) => {
      inner += `[${i + 1}] ${s.title}\nURL: ${s.url}\nExtrait: ${s.content}\n\n`
    })
  }
  if (!inner) return 'Aucun resultat pertinent trouve.'

  // Wrap dans des tags clairs - meilleure pratique pour signaler du contenu non fiable au LLM
  return `<web_search_result>
${inner}</web_search_result>`
}