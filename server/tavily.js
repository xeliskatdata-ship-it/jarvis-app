// Service Tavily AI - recherche web optimisée pour les LLM agents
// L'API renvoie déjà des résumés synthétiques, donc parfait pour Jarvis

import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

const TAVILY_URL = 'https://api.tavily.com/search'

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

  return {
    answer: data.answer || '',
    sources: (data.results || []).slice(0, maxResults).map(r => ({
      title: r.title,
      url: r.url,
      content: (r.content || '').slice(0, 500)  // tronqué - évite context overflow
    }))
  }
}

// Formate le résultat de recherche en texte prêt à être injecté dans le LLM
export function formatSearchForLLM({ answer, sources }) {
  let text = ''
  if (answer) text += `Synthèse directe : ${answer}\n\n`
  if (sources.length > 0) {
    text += `Sources consultées :\n`
    sources.forEach((s, i) => {
      text += `[${i + 1}] ${s.title}\nURL: ${s.url}\nExtrait: ${s.content}\n\n`
    })
  }
  return text || 'Aucun résultat pertinent trouvé.'
}