// Module N4 : auto-reflexion
// Detecte les conversations dormantes et genere 0-2 patterns comportementaux
// sur l'utilisateur. Dedup vectoriel pour eviter pollution de la N2.
//
// Architecture economique : pas de cron 24/7
// - Trigger naturel : quand l'user revient parler a Jarvis (depuis server.js /chat)
// - Trigger manuel : endpoint POST /reflect/now (admin)

import { query } from './db.js'
import { chat } from './groq.js'
import { embed, toPgVector } from './mistral.js'
import { logUsage } from './usage.js'

const MIN_EXCHANGES = 5                    // moins de 5 = pas assez de matiere
const DORMANT_MINUTES = 30                 // une conv est "dormante" apres 30 min sans activite
const CONTEXT_MESSAGES = 20                // 10 echanges = 20 messages (user + assistant)
const MAX_LESSONS_PER_REFLECTION = 2       // garde-fou anti-pollution
const DEDUP_SIMILARITY_THRESHOLD = 0.85    // cosine au-dessus = considere comme doublon

// === Detection : y a-t-il une conv dormante non reflechie pour cet user ? ===
// Retourne { conversationId, messageCount } ou null si rien a reflechir
export async function findDormantConversation(userId) {
  const { rows } = await query(`
    SELECT 
      c.id AS conversation_id,
      COUNT(m.id)::int AS message_count,
      c.updated_at,
      EXTRACT(EPOCH FROM (NOW() - c.updated_at))/60 AS minutes_ago
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE c.user_id = $1
      AND c.reflected_at IS NULL
      AND c.updated_at < NOW() - INTERVAL '${DORMANT_MINUTES} minutes'
    GROUP BY c.id
    HAVING COUNT(m.id) >= ${MIN_EXCHANGES * 2}
    ORDER BY c.updated_at DESC
    LIMIT 1
  `, [userId])

  if (rows.length === 0) return null
  return {
    conversationId: rows[0].conversation_id,
    messageCount: rows[0].message_count,
    minutesAgo: Math.floor(rows[0].minutes_ago)
  }
}

// === Reflexion sur une conv specifique ===
// Recupere les messages, genere les patterns, dedupe, insere, marque la conv
export async function reflectOnConversation(userId, conversationId) {
  // 1. Recupere les derniers messages de la conv
  const { rows: messages } = await query(`
    SELECT role, content, created_at
    FROM messages
    WHERE conversation_id = $1
    ORDER BY created_at DESC
    LIMIT ${CONTEXT_MESSAGES}
  `, [conversationId])

  if (messages.length < MIN_EXCHANGES * 2) {
    return { ok: false, reason: 'pas assez de messages' }
  }

  // Remet dans l'ordre chronologique pour le prompt
  const orderedMessages = messages.reverse()
  const conversationText = orderedMessages
    .map(m => `${m.role === 'user' ? 'Utilisateur' : 'Jarvis'} : ${m.content}`)
    .join('\n\n')

  // 2. Recupere les lecons existantes pour eviter doublons textuels (le LLM les voit)
  const { rows: existingLessons } = await query(`
    SELECT fact FROM memories 
    WHERE user_id = $1 AND source = 'reflection'
    ORDER BY created_at DESC
    LIMIT 30
  `, [userId])

  const existingLessonsText = existingLessons.length > 0
    ? existingLessons.map(l => `- ${l.fact}`).join('\n')
    : '(aucune pour le moment)'

  // 3. Prompt de reflexion
  const systemPrompt = `Tu es un systeme d'analyse comportementale pour Jarvis (assistant personnel).
Analyse cette conversation et identifie 0 a ${MAX_LESSONS_PER_REFLECTION} PATTERNS comportementaux NOUVEAUX sur l'utilisateur.

Un PATTERN n'est PAS un simple fait. C'est une meta-observation sur comment l'utilisateur fonctionne :
- Style de communication, de travail, d'apprentissage
- Preferences profondes (vs preferences ponctuelles)
- Habitudes recurrentes, biais, tics
- Maniere d'aborder les problemes ou les decisions

EXEMPLES de bons patterns (pour calibrer ton niveau d'analyse) :
- "Prefere apprendre par la pratique : pose peu de questions theoriques, beaucoup de questions concretes en cours d'implementation"
- "Tend a sous-estimer le temps des taches (estimations 3h finissent souvent en 5h)"
- "S'investit profondement dans les projets : itere plusieurs versions plutot qu'une approche en cascade"
- "Reflexe documentation : prefere figer un etat stable avant d'attaquer un nouveau chantier"

EXEMPLES de mauvais patterns (a EVITER) :
- "Aime travailler en musique le matin" -> c'est un FAIT, pas un pattern
- "Code en JavaScript" -> fait, pas pattern  
- "Pose des questions" -> trop banal et generique
- "Est intelligente" -> jugement non-actionable
- "Aime la tech" -> banal

PATTERNS DEJA CONNUS - NE PAS RE-EXTRAIRE (cherche du nouveau) :
${existingLessonsText}

REGLES :
- Pattern formule a la 3eme personne, factuel (jamais "je pense que...")
- 15-30 mots max par pattern
- Si rien de SUBSTANTIELLEMENT nouveau dans cette conv, retourne {"lessons": []}. C'est OK et meme preferable a un pattern banal.
- 0 est une reponse valide et bienvenue si la conv etait trop courte/superficielle.

Retourne UNIQUEMENT un JSON valide :
{
  "lessons": [
    { "lesson": "Pattern observe a la 3eme personne, factuel, 15-30 mots." }
  ]
}`

  // 4. Appel LLM (modele principal GPT-OSS 120B pour qualite)
  let parsedLessons = []
  let usage = null
  let model = null
  try {
    const result = await chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: conversationText }
    ], { json: true, temperature: 0.5, max_tokens: 400 })

    usage = result.usage
    model = result.model

    const parsed = JSON.parse(result.content)
    parsedLessons = Array.isArray(parsed.lessons) ? parsed.lessons : []

    logUsage({ userId, endpoint: 'reflect', model, usage, statusCode: 200 })
  } catch (err) {
    console.warn('[reflect] LLM call failed:', err.message)
    logUsage({ userId, endpoint: 'reflect', model: null, statusCode: 500, errorMsg: err.message })
    return { ok: false, reason: 'llm_failed', error: err.message }
  }

  // Filtre les lecons malformees
  const validLessons = parsedLessons
    .filter(l => l.lesson && typeof l.lesson === 'string' && l.lesson.length >= 10 && l.lesson.length <= 250)
    .slice(0, MAX_LESSONS_PER_REFLECTION)

  if (validLessons.length === 0) {
    // Marque la conv comme reflechie meme si 0 lecon (eviter de re-tenter en boucle)
    await query(`UPDATE conversations SET reflected_at = NOW() WHERE id = $1`, [conversationId])
    console.log(`[reflect] user ${userId} conv ${conversationId} : 0 lecon (conv pas assez riche)`)
    return { ok: true, lessons_generated: 0, lessons_inserted: 0, lessons: [] }
  }

  // 5. Embed batch des nouvelles lecons
  const lessonTexts = validLessons.map(l => l.lesson.trim())
  let embeddings = null
  try {
    embeddings = await embed(lessonTexts)
  } catch (err) {
    console.warn('[reflect] embed failed:', err.message)
    // Continue sans embedding (insertion fallback)
  }

  // 6. Dedup vectoriel : pour chaque nouvelle lecon, check similarite avec lecons existantes
  const inserted = []
  const skipped = []

  for (let i = 0; i < validLessons.length; i++) {
    const lessonText = lessonTexts[i]
    const lessonEmb = embeddings?.[i]

    // Check dedup uniquement si on a un embedding
    if (lessonEmb) {
      const queryVec = toPgVector(lessonEmb)
      const { rows: similar } = await query(`
        SELECT id, fact, 1 - (embedding <=> $2::vector) AS similarity
        FROM memories
        WHERE user_id = $1 
          AND source = 'reflection'
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $2::vector
        LIMIT 1
      `, [userId, queryVec])

      if (similar.length > 0 && similar[0].similarity >= DEDUP_SIMILARITY_THRESHOLD) {
        skipped.push({
          new_lesson: lessonText,
          duplicate_of: similar[0].fact,
          similarity: Number(similar[0].similarity).toFixed(3)
        })
        continue
      }
    }

    // Insert avec embedding (ou sans si embed a plante)
    try {
      if (lessonEmb) {
        await query(`
          INSERT INTO memories (user_id, fact, category, importance, shared, source, embedding)
          VALUES ($1, $2, 'pattern', 8, false, 'reflection', $3::vector)
        `, [userId, lessonText, toPgVector(lessonEmb)])
      } else {
        await query(`
          INSERT INTO memories (user_id, fact, category, importance, shared, source)
          VALUES ($1, $2, 'pattern', 8, false, 'reflection')
        `, [userId, lessonText])
      }
      inserted.push(lessonText)
    } catch (err) {
      console.warn('[reflect] insert failed:', err.message)
    }
  }

  // 7. Marque la conv comme reflechie
  await query(`UPDATE conversations SET reflected_at = NOW() WHERE id = $1`, [conversationId])

  console.log(`[reflect] user ${userId} conv ${conversationId} : ${inserted.length} nouvelles + ${skipped.length} skipped (doublon)`)
  return {
    ok: true,
    lessons_generated: validLessons.length,
    lessons_inserted: inserted.length,
    lessons_skipped: skipped.length,
    lessons: inserted,
    skipped
  }
}

// === Helper principal : check + reflechit si conv dormante existe ===
// Appele depuis /chat en background (ne bloque jamais la reponse)
export async function maybeReflect(userId) {
  try {
    const dormant = await findDormantConversation(userId)
    if (!dormant) return null

    console.log(`[reflect] conv dormante detectee user ${userId} : conv ${dormant.conversationId} (${dormant.messageCount} messages, ${dormant.minutesAgo}min)`)
    return await reflectOnConversation(userId, dormant.conversationId)
  } catch (err) {
    console.warn('[reflect] maybeReflect echoue:', err.message)
    return null
  }
}
