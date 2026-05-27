// Router de personas - choix via process.env.ACTIVE_PERSONA
// Fallback safe sur 'jarvis' si la variable est absente ou inconnue

import jarvis from './jarvis.js'
import walle from './walle.js'

const REGISTRY = {
  jarvis,
  walle
}

export function getPersona() {
  const requested = (process.env.ACTIVE_PERSONA || 'jarvis').toLowerCase()
  const persona = REGISTRY[requested]
  if (!persona) {
    console.warn(`[persona] ACTIVE_PERSONA="${requested}" inconnu, fallback sur 'jarvis'. Disponibles: ${Object.keys(REGISTRY).join(', ')}`)
    return REGISTRY.jarvis
  }
  return persona
}

// Expose la liste pour les logs / un futur endpoint admin
export function listPersonas() {
  return Object.values(REGISTRY).map(p => ({
    id: p.id,
    displayName: p.displayName,
    version: p.version
  }))
}
