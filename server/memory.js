// Memoire enrichie style Jarvis d'Iron Man
// - getMemoriesContext : charge les faits a long terme pour enrichir le system prompt
// - extractFacts : analyse l'echange et stocke 0-3 faits importants (appele en background)
// - detectExplicitTrigger / extractExplicitFact : N1, memoire forcee par phrase declencheur
// v3 : N1 - memoire explicite ("souviens-toi que...")

import { query } from './db.js'
import { chat } from './groq.js'

// === N1 : declencheurs linguistiques pour memoire forcee ===
// On match large : FR + EN, avec/sans "que/de", apostrophes courbes ou droites
const EXPLICIT_TRIGGERS = /\b(souviens[- ]toi (que|de)|n['']oublie pas (que|de)|rappelle[- ]toi (que|de)|retiens (bien )?(que|ceci)|note (bien )?(que|ceci)|memorise (que|ceci)|remember (that|this)|don['']t forget (that|this)|memorize (that|this))\b/i

export function detectExplicitTrigger(message) {
  if (!message || typeof message !== 'string') return false
  return EXPLICIT_TRIGGERS.test(message)
}

// Charge les memoires pertinentes : perso (user_id matche) + shared (couple)
export async function getMemoriesContext(userId) {
  const { rows } = await query(`
    SELECT m.fact, m.category, m.importance, m.shared, m.source, m.user_id,
           u.name as owner_name
    FROM memories m
    JOIN users u ON u.id = m.user_id
    WHERE m.user_id = $1 OR m.shared = true
    ORDER BY 
      CASE WHEN m.source = 'explicit' THEN 0 ELSE 1 END,  -- explicit d'abord
      m.importance DESC, 
      m.last_used_at DESC
    LIMIT 60
  `, [userId])

  if (rows.length === 0) return ''

  // Groupement par categorie pour un contexte plus lisible par le LLM
  const grouped = {}
  for (const r of rows) {
    const ownerTag = r.shared && r.user_id !== userId ? ` [partage par ${r.owner_name}]` : ''
    // Marqueur visuel pour mémoires explicites - le LLM doit y accorder plus de poids
    const explicitTag = r.source === 'explicit' ? 'IMPORTANT - ' : ''
    const line = `- ${explicitTag}${r.fact}${ownerTag}`
    if (!grouped[r.category]) grouped[r.category] = []
    grouped[r.category].push(line)
  }

  // Ordre d'affichage : personnel d'abord, puis projets, puis le reste
  const order = ['personal_fact', 'relationship', 'project', 'preference', 'habit',
                 'schedule', 'goal', 'opinion', 'emotional_state', 'event', 'other']
  const sections = []
  for (const cat of order) {
    if (grouped[cat]?.length) {
      sections.push(`${cat.toUpperCase()} :\n${grouped[cat].join('\n')}`)
    }
  }

  // Touch last_used_at pour favoriser les memoires effectivement utilisees
  query(`UPDATE memories SET last_used_at = NOW() WHERE user_id = $1 OR shared = true`, [userId])
    .catch(() => {})

  return `\n\n=== Ce que tu connais de cette personne ===\n${sections.join('\n\n')}\n=== Fin memoires ===`
}

// === N1 : extraction d'un fait explicite ===
// Appelee quand detectExplicitTrigger() = true, en background depuis server.js
// Prompt focalise car on SAIT deja qu'il y a une demande de memorisation
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

    let inserted = 0
    for (const f of facts) {
      if (!f.fact || typeof f.fact !== 'string' || f.fact.length < 5) continue
      const cat = validCategories.includes(f.category) ? f.category : 'other'

      // Importance forcee a 9 : demande explicite = priorite haute, mais pas 10 (reserve aux faits vitaux)
      await query(`
        INSERT INTO memories (user_id, fact, category, importance, shared, source)
        VALUES ($1, $2, $3, 9, $4, 'explicit')
      `, [userId, f.fact.trim(), cat, !!f.shared])
      inserted++
    }

    if (inserted > 0) {
      console.log(`[memory N1] +${inserted} fait(s) EXPLICITE(s) memorise(s) pour user ${userId}`)
    } else {
      console.warn(`[memory N1] declencheur detecte mais aucun fait extrait : "${userMessage.slice(0, 80)}"`)
    }
    return facts
  } catch (err) {
    console.warn('[memory N1] extraction explicite echouee:', err.message)
    return []
  }
}

// === N0 (existant) : extraction auto en background ===
// Extrait 0-3 faits a memoriser depuis le dernier echange
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
- Faits deja gerer par N1 (si l'utilisateur a dit "souviens-toi que...", c'est traite ailleurs, n'extrais pas la meme chose ici)

Retourne UNIQUEMENT un JSON valide :
{
  "facts": [
    {
      "fact": "Phrase courte factuelle a la 3eme personne, sans le prenom (ex: 'aime les films de Christopher Nolan')",
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

    let inserted = 0
    for (const f of facts) {
      if (!f.fact || typeof f.fact !== 'string' || f.fact.length < 5) continue
      const cat = validCategories.includes(f.category) ? f.category : 'other'

      // source='auto' explicite (au lieu du DEFAULT) pour rendre la distinction claire dans le code
      await query(`
        INSERT INTO memories (user_id, fact, category, importance, shared, source)
        VALUES ($1, $2, $3, $4, $5, 'auto')
      `, [
        userId,
        f.fact.trim(),
        cat,
        Math.min(10, Math.max(1, parseInt(f.importance) || 5)),
        !!f.shared
      ])
      inserted++
    }

    if (inserted > 0) console.log(`[memory] +${inserted} fait(s) memorise(s) pour user ${userId}`)
    return facts
  } catch (err) {
    console.warn('[memory] extraction echouee:', err.message)
    return []
  }
}
