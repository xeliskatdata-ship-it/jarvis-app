// Mémoire enrichie style Jarvis d'Iron Man
// - getMemoriesContext : charge les faits à long terme pour enrichir le system prompt
// - extractFacts : analyse l'échange et stocke 0-3 faits importants (appelé en background)
// v2 : catégories étendues (habit, goal, opinion, schedule, emotional_state)

import { query } from './db.js'
import { chat } from './groq.js'

// Charge les mémoires pertinentes : perso (user_id matché) + shared (couple)
export async function getMemoriesContext(userId) {
  const { rows } = await query(`
    SELECT m.fact, m.category, m.importance, m.shared, m.user_id,
           u.name as owner_name
    FROM memories m
    JOIN users u ON u.id = m.user_id
    WHERE m.user_id = $1 OR m.shared = true
    ORDER BY m.importance DESC, m.last_used_at DESC
    LIMIT 60
  `, [userId])

  if (rows.length === 0) return ''

  // Groupement par catégorie pour un contexte plus lisible par le LLM
  const grouped = {}
  for (const r of rows) {
    const tag = r.shared && r.user_id !== userId ? ` [partagé par ${r.owner_name}]` : ''
    const line = `- ${r.fact}${tag}`
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

  // Touch last_used_at pour favoriser les mémoires effectivement utilisées
  query(`UPDATE memories SET last_used_at = NOW() WHERE user_id = $1 OR shared = true`, [userId])
    .catch(() => {})

  return `\n\n=== Ce que tu connais de cette personne ===\n${sections.join('\n\n')}\n=== Fin mémoires ===`
}

// Extrait 0-3 faits à mémoriser depuis le dernier échange
export async function extractFacts(userId, userMessage, assistantMessage) {
  const systemPrompt = `Tu es un système d'extraction de faits pour Jarvis. Analyse l'échange ci-dessous et extrais 0 à 3 faits importants à mémoriser à LONG TERME sur l'utilisateur.

CATÉGORIES DISPONIBLES :
- personal_fact : nom, métier, formation, famille, lieu de vie, animaux, traits identitaires
- relationship : proches, collègues, partenaires (qui est qui)
- project : projets perso ou pro en cours
- preference : films, musique, nourriture, sports, marques, choix techniques
- habit : routines quotidiennes ("fait son footing le matin", "boit du thé le soir")
- schedule : rythme de vie, horaires de travail, jours occupés
- goal : objectifs court/moyen/long terme ("veut décrocher un CDI", "apprendre l'espagnol")
- opinion : positions sur des sujets (tech, société, vie)
- emotional_state : humeur récente, fatigue, stress, joie (à utiliser avec parcimonie, vrais signaux)
- event : rendez-vous, voyages, anniversaires avec date si possible
- other : autre fait pertinent

À IGNORER :
- Détails triviaux ou éphémères
- Demandes ponctuelles ("envoie un sms")

Retourne UNIQUEMENT un JSON valide :
{
  "facts": [
    {
      "fact": "Phrase courte factuelle à la 3ème personne, sans le prénom (ex: 'aime les films de Christopher Nolan')",
      "category": "<une des catégories ci-dessus>",
      "importance": 1-10,
      "shared": true|false
    }
  ]
}

"shared": true si pertinent pour un partenaire de vie (événement de couple, projet commun, anniversaire d'un proche commun, changement de vie majeur).
"shared": false pour les préférences purement perso, humeurs, opinions individuelles.

Si rien à mémoriser, retourne {"facts": []}.`

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

      await query(`
        INSERT INTO memories (user_id, fact, category, importance, shared)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        userId,
        f.fact.trim(),
        cat,
        Math.min(10, Math.max(1, parseInt(f.importance) || 5)),
        !!f.shared
      ])
      inserted++
    }

    if (inserted > 0) console.log(`[memory] +${inserted} fait(s) mémorisé(s) pour user ${userId}`)
    return facts
  } catch (err) {
    console.warn('[memory] extraction échouée:', err.message)
    return []
  }
}