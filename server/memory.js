// Memoire enrichie style Jarvis d'Iron Man
// - getMemoriesContext : top-K vectoriel + explicites pour enrichir le system prompt
// - extractFacts : analyse l'echange et stocke 0-3 faits importants (appele en background)
// - detectExplicitTrigger / extractExplicitFact : N1, memoire forcee par phrase declencheur
// v4 : N2 - recherche vectorielle via mistral-embed + pgvector cosine

import { query } from './db.js'
import { chat } from './groq.js'
import { embed, toPgVector } from './mistral.js'

const TOP_K = 8  // nombre de memoires auto rapatriees par recherche vectorielle

// === N1 : declencheurs linguistiques pour memoire forcee ===
const EXPLICIT_TRIGGERS = /\b(souviens[- ]toi (que|de)|n['']oublie pas (que|de)|rappelle[- ]toi (que|de)|retiens (bien )?(que|ceci)|note (bien )?(que|ceci)|memorise (que|ceci)|remember (that|this)|don['']t forget (that|this)|memorize (that|this))\b/i

export function detectExplicitTrigger(message) {
  if (!message || typeof message !== 'string') return false
  return EXPLICIT_TRIGGERS.test(message)
}

// === N2 : recuperation du contexte memoire ===
// - explicit : toutes les memoires marquees explicit (priorite cognitive haute)
// - auto : top-K semantiquement proches du message courant (recherche vectorielle cosine)
export async function getMemoriesContext(userId, currentMessage = '') {
  // 1. Memoires explicites - toujours toutes injectees (max 20 pour bornage)
  const { rows: explicitRows } = await query(`
    SELECT m.id, m.fact, m.category, m.importance, m.shared, m.source, m.user_id,
           u.name as owner_name
    FROM memories m
    JOIN users u ON u.id = m.user_id
    WHERE (m.user_id = $1 OR m.shared = true)
      AND m.source = 'explicit'
    ORDER BY m.importance DESC, m.created_at DESC
    LIMIT 20
  `, [userId])

  // 2. Memoires auto - top-K par similarite cosine au message courant
  let autoRows = []
  if (currentMessage?.trim()) {
    try {
      const [queryEmb] = await embed(currentMessage)
      const queryVec = toPgVector(queryEmb)

      // Operator <=> = distance cosine (0 = identique, 2 = opposes)
      // similarity = 1 - distance (1 = identique, -1 = opposes)
      const { rows } = await query(`
        SELECT m.id, m.fact, m.category, m.importance, m.shared, m.source, m.user_id,
               u.name as owner_name,
               1 - (m.embedding <=> $2::vector) AS similarity
        FROM memories m
        JOIN users u ON u.id = m.user_id
        WHERE (m.user_id = $1 OR m.shared = true)
          AND m.source != 'explicit'
          AND m.embedding IS NOT NULL
        ORDER BY m.embedding <=> $2::vector
        LIMIT $3
      `, [userId, queryVec, TOP_K])
      autoRows = rows

      // Log de debug : top et bottom similarites du batch retourne
      if (rows.length > 0) {
        const topSim = Number(rows[0].similarity).toFixed(3)
        const lowSim = Number(rows[rows.length - 1].similarity).toFixed(3)
        console.log(`[memory N2] top-${rows.length} similarites: ${topSim} -> ${lowSim}`)
      }
    } catch (err) {
      console.warn('[memory N2] recherche vectorielle echouee, fallback non-semantique:', err.message)
      autoRows = await fetchAutoFallback(userId)
    }
  } else {
    // Pas de message courant (cas init ou greeting vide) : fallback non-semantique
    autoRows = await fetchAutoFallback(userId)
  }

  const allRows = [...explicitRows, ...autoRows]
  if (allRows.length === 0) return ''

  // Groupement par categorie pour un contexte plus lisible par le LLM
  const grouped = {}
  for (const r of allRows) {
    const ownerTag = r.shared && r.user_id !== userId ? ` [partage par ${r.owner_name}]` : ''
    // Marqueur visuel pour memoires explicites - le LLM doit y accorder plus de poids
    const explicitTag = r.source === 'explicit' ? 'IMPORTANT - ' : ''
    const line = `- ${explicitTag}${r.fact}${ownerTag}`
    if (!grouped[r.category]) grouped[r.category] = []
    grouped[r.category].push(line)
  }

  const order = ['personal_fact', 'relationship', 'project', 'preference', 'habit',
                 'schedule', 'goal', 'opinion', 'emotional_state', 'event', 'other']
  const sections = []
  for (const cat of order) {
    if (grouped[cat]?.length) {
      sections.push(`${cat.toUpperCase()} :\n${grouped[cat].join('\n')}`)
    }
  }

  // Touch last_used_at SEULEMENT sur les memoires effectivement injectees
  // (avant on touchait toutes les memoires de l'user, ce qui rendait le signal inutile)
  const usedIds = allRows.map(r => r.id).filter(Boolean)
  if (usedIds.length > 0) {
    query(`UPDATE memories SET last_used_at = NOW() WHERE id = ANY($1::int[])`, [usedIds])
      .catch(() => {})
  }

  return `\n\n=== Ce que tu connais de cette personne ===\n${sections.join('\n\n')}\n=== Fin memoires ===`
}

// Fallback non-semantique - utilise si pas de message courant ou si l'embedding plante
async function fetchAutoFallback(userId) {
  const { rows } = await query(`
    SELECT m.id, m.fact, m.category, m.importance, m.shared, m.source, m.user_id,
           u.name as owner_name
    FROM memories m
    JOIN users u ON u.id = m.user_id
    WHERE (m.user_id = $1 OR m.shared = true)
      AND m.source != 'explicit'
    ORDER BY m.importance DESC, m.last_used_at DESC
    LIMIT $2
  `, [userId, TOP_K])
  return rows
}

// === N1 : extraction d'un fait explicite + calcul embedding ===
export async function extractExplicitFact(userId, userMessage) {
  const systemPrompt = `L'utilisateur t'a explicitement demande de memoriser quelque chose. Extrais le ou les faits a retenir depuis sa phrase.

CATEGORIES :
- personal_fact, relationship, project, preference, habit, schedule, goal, opinion, event, other

Retourne UNIQUEMENT un JSON valide :
{
  "facts": [
    {
      "fact": "Phrase courte factuelle a la 3eme personne, sans le prenom (ex: 'aime les films de Christopher Nolan', 'a un chat noir nomme Whiskers')",
      "category": "<une categorie ci-dessus>",
      "shared": true|false
    }
  ]
}

REGLES :
- Reformule a la 3eme personne (jamais "je", toujours implicite "il/elle")
- "shared": true si concerne un proche commun, un projet de couple, un evenement partage
- "shared": false sinon (preference perso, opinion, habitude individuelle)
- Si la demande est ambigue, extrait le mieux possible (1 fait minimum si la phrase contient un declencheur clair)
- Si vraiment rien d'extractable, retourne {"facts": []}`

  try {
    const raw = await chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ], { json: true, temperature: 0.2, max_tokens: 300 })

    const parsed = JSON.parse(raw)
    const facts = Array.isArray(parsed.facts) ? parsed.facts : []

    const validCategories = ['personal_fact', 'relationship', 'project', 'preference',
                             'habit', 'schedule', 'goal', 'opinion', 'emotional_state',
                             'event', 'other']

    const validFacts = facts.filter(f =>
      f.fact && typeof f.fact === 'string' && f.fact.length >= 5
    )

    if (validFacts.length === 0) {
      console.warn(`[memory N1] declencheur detecte mais aucun fait extrait : "${userMessage.slice(0, 80)}"`)
      return []
    }

    // Calcul des embeddings en batch (1 appel API meme si plusieurs faits)
    const texts = validFacts.map(f => f.fact.trim())
    let embeddings = null
    try {
      embeddings = await embed(texts)
    } catch (err) {
      console.warn('[memory N1] embedding echoue, insertion sans vector :', err.message)
    }

    let inserted = 0
    for (let i = 0; i < validFacts.length; i++) {
      const f = validFacts[i]
      const cat = validCategories.includes(f.category) ? f.category : 'other'

      if (embeddings) {
        await query(`
          INSERT INTO memories (user_id, fact, category, importance, shared, source, embedding)
          VALUES ($1, $2, $3, 9, $4, 'explicit', $5::vector)
        `, [userId, f.fact.trim(), cat, !!f.shared, toPgVector(embeddings[i])])
      } else {
        // Fallback : insert sans embedding si Mistral down (retrouvable plus tard via backfill)
        await query(`
          INSERT INTO memories (user_id, fact, category, importance, shared, source)
          VALUES ($1, $2, $3, 9, $4, 'explicit')
        `, [userId, f.fact.trim(), cat, !!f.shared])
      }
      inserted++
    }

    console.log(`[memory N1] +${inserted} fait(s) EXPLICITE(s) memorise(s) pour user ${userId}`)
    return validFacts
  } catch (err) {
    console.warn('[memory N1] extraction explicite echouee:', err.message)
    return []
  }
}

// === N0 : extraction auto en background + calcul embedding ===
export async function extractFacts(userId, userMessage, assistantMessage) {
  const systemPrompt = `Tu es un systeme d'extraction de faits pour Jarvis. Analyse l'echange ci-dessous et extrais 0 a 3 faits importants a memoriser a LONG TERME sur l'utilisateur.

CATEGORIES DISPONIBLES :
- personal_fact : nom, metier, formation, famille, lieu de vie, animaux, traits identitaires
- relationship : proches, collegues, partenaires (qui est qui)
- project : projets perso ou pro en cours
- preference : films, musique, nourriture, sports, marques, choix techniques
- habit : routines quotidiennes ("fait son footing le matin", "boit du the le soir")
- schedule : rythme de vie, horaires de travail, jours occupes
- goal : objectifs court/moyen/long terme ("veut decrocher un CDI", "apprendre l'espagnol")
- opinion : positions sur des sujets (tech, societe, vie)
- emotional_state : humeur recente, fatigue, stress, joie (a utiliser avec parcimonie, vrais signaux)
- event : rendez-vous, voyages, anniversaires avec date si possible
- other : autre fait pertinent

A IGNORER :
- Details triviaux ou ephemeres
- Demandes ponctuelles ("envoie un sms")
- Faits deja gerer par N1 (si l'utilisateur a dit "souviens-toi que...", c'est traite ailleurs)

Retourne UNIQUEMENT un JSON valide :
{
  "facts": [
    {
      "fact": "Phrase courte factuelle a la 3eme personne, sans le prenom",
      "category": "<une des categories ci-dessus>",
      "importance": 1-10,
      "shared": true|false
    }
  ]
}

"shared": true si pertinent pour un partenaire de vie (evenement de couple, projet commun, anniversaire d'un proche commun, changement de vie majeur).
"shared": false pour les preferences purement perso, humeurs, opinions individuelles.

Si rien a memoriser, retourne {"facts": []}.`

  const userContent = `Utilisateur : "${userMessage}"\n\nJarvis : "${assistantMessage}"`

  try {
    const raw = await chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ], { json: true, temperature: 0.3, max_tokens: 500 })

    const parsed = JSON.parse(raw)
    const facts = Array.isArray(parsed.facts) ? parsed.facts : []

    const validCategories = ['personal_fact', 'relationship', 'project', 'preference',
                             'habit', 'schedule', 'goal', 'opinion', 'emotional_state',
                             'event', 'other']

    const validFacts = facts.filter(f =>
      f.fact && typeof f.fact === 'string' && f.fact.length >= 5
    )

    if (validFacts.length === 0) return []

    // Calcul des embeddings en batch
    const texts = validFacts.map(f => f.fact.trim())
    let embeddings = null
    try {
      embeddings = await embed(texts)
    } catch (err) {
      console.warn('[memory] embedding echoue, insertion sans vector :', err.message)
    }

    let inserted = 0
    for (let i = 0; i < validFacts.length; i++) {
      const f = validFacts[i]
      const cat = validCategories.includes(f.category) ? f.category : 'other'
      const importance = Math.min(10, Math.max(1, parseInt(f.importance) || 5))

      if (embeddings) {
        await query(`
          INSERT INTO memories (user_id, fact, category, importance, shared, source, embedding)
          VALUES ($1, $2, $3, $4, $5, 'auto', $6::vector)
        `, [userId, f.fact.trim(), cat, importance, !!f.shared, toPgVector(embeddings[i])])
      } else {
        await query(`
          INSERT INTO memories (user_id, fact, category, importance, shared, source)
          VALUES ($1, $2, $3, $4, $5, 'auto')
        `, [userId, f.fact.trim(), cat, importance, !!f.shared])
      }
      inserted++
    }

    if (inserted > 0) console.log(`[memory] +${inserted} fait(s) memorise(s) pour user ${userId}`)
    return validFacts
  } catch (err) {
    console.warn('[memory] extraction echouee:', err.message)
    return []
  }
}