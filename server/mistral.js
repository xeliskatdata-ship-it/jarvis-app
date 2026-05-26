// Client Mistral pour embeddings (mistral-embed, 1024 dims)
// API REST directe sans SDK pour rester leger
// Doc : https://docs.mistral.ai/api/#tag/embeddings

const MISTRAL_EMBED_URL = 'https://api.mistral.ai/v1/embeddings'
const MISTRAL_EMBED_MODEL = 'mistral-embed'

// Calcule les embeddings pour 1 ou N textes
// Accepte string ou array<string>
// Retourne toujours un array de vectors (chacun = 1024 floats)
export async function embed(texts) {
  if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY manquante')

  const inputs = Array.isArray(texts) ? texts : [texts]
  if (inputs.length === 0) return []

  const res = await fetch(MISTRAL_EMBED_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MISTRAL_EMBED_MODEL,
      input: inputs
    })
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Mistral embed ${res.status}: ${errBody.slice(0, 200)}`)
  }

  const { data } = await res.json()
  // Tri par index : l'API peut retourner dans le desordre selon le batch
  data.sort((a, b) => a.index - b.index)
  return data.map(d => d.embedding)
}

// Convertit un array JS de floats en string format pgvector : "[0.1,0.2,...]"
// Postgres caste cette string en vector via "::vector"
export function toPgVector(arr) {
  return '[' + arr.join(',') + ']'
}
