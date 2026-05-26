// Module N4 : auto-reflexion
// Detecte les conversations dormantes et genere 0-2 patterns comportementaux
// sur l'utilisateur. Dedup vectoriel pour eviter pollution de la N2.
//
// v2 : fix JSON validation failures (CONTEXT_MESSAGES reduit, prompt renforce, retry)

import { query } from './db.js'
import { chat } from './groq.js'
import { embed, toPgVector } from './mistral.js'
import { logUsage } from './usage.js'

const MIN_EXCHANGES = 5
const DORMANT_MINUTES = 30
const CONTEXT_MESSAGES = 10                // 5 echanges = 10 messages (etait 20)
const MAX_LESSONS_PER_REFLECTION = 2
const DEDUP_SIMILARITY_THRESHOLD = 0.85

// === Detection : conv dormante non reflechie pour cet user ===
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

// === Reflexion sur une conv ===
export async function reflectOnConversation(userId, conversationId) {
  // Recupere les CONTEXT_MESSAGES derniers messages (10 = 5 echanges)
  // Sur une conv de 384 messages, on ne prend que les 10 plus recents pour eviter
  // de noyer le LLM dans un contexte enorme qui le faisait halluciner un JSON vide
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

  const orderedMessages = messages.reverse()
  // Tronque chaque message a 800 chars pour eviter prompt obese
  const conversationText = orderedMessages
    .map(m => `${m.role === 'user' ? 'Utilisateur' : 'Jarvis'} : ${m.content.slice(0, 800)}`)
    .join('\n\n')

  // Lecons existantes (max 20 pour ne pas exploser le prompt)
  const { rows: existingLessons } = await query(`
    SELECT fact FROM memories 
    WHERE user_id = $1 AND source = 'reflection'
    ORDER BY created_at DESC
    LIMIT 20
  `, [userId])

  const existingLessonsText = existingLessons.length > 0
    ? existingLessons.map(l => `- ${l.fact}`).join('\n')
    : '(aucune pour le moment)'

  // === Prompt renforce v2 : reponse JSON STRICTEMENT obligatoire ===
  const systemPrompt = `Tu es un systeme d'analyse comportementale pour Jarvis (assistant personnel).
Analyse cette conversation et identifie 0 a ${MAX_LESSONS_PER_REFLECTION} PATTERNS comportementaux NOUVEAUX sur l'utilisateur.

REPONSE OBLIGATOIRE : tu DOIS toujours repondre avec un JSON valide.
Format strict :
{ "lessons": [ { "lesson": "..." } ] }
ou si rien a extraire :
{ "lessons": [] }
JAMAIS de reponse vide. JAMAIS de texte hors du JSON.

DEFINITION D'UN PATTERN :
Un pattern n'est PAS un simple fait. C'est une meta-observation sur comment l'utilisateur fonctionne :
- Style de communication, de travail, d'apprentissage
- Preferences profondes (vs preferences ponctuelles)
- Habitudes recurrentes, biais, tics
- Maniere d'aborder les problemes ou les decisions

EXEMPLES de bons patterns :
- "Prefere apprendre par la pratique : pose peu de questions theoriques, beaucoup de questions concretes en cours d'implementation"
- "Tend a sous-estimer le temps des taches (estimations 3h finissent en 5h)"
- "S'investit profondement dans les projets : itere plusieurs versions plutot qu'une approche en cascade"
- "Reflexe documentation : prefere figer un etat stable avant d'attaquer un nouveau chantier"

A EVITER :
- "Aime travailler en musique le matin" -> c'est un FAIT, pas un pattern
- "Pose des questions" -> trop banal
- "Est intelligente" -> jugement non-actionable

PATTERNS DEJA CONNUS - NE PAS RE-EXTRAIRE :
${existingLessonsText}

REGLES :
- Pattern formule a la 3eme personne, factuel
- 15-30 mots max par pattern
- Si rien de SUBSTANTIELLEMENT nouveau, retourne {"lessons": []}. C'est ok et meme prefere a un pattern banal.

JSON OBLIGATOIRE EN SORTIE. RAPPEL : JAMAIS de reponse vide.`

  // Appel LLM avec retry si JSON validation echoue
  let parsedLessons = []
  let usage = null
  let model = null
  let lastError = null

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Conversation a analyser :\n\n${conversationText}\n\nReponds UNIQUEMENT en JSON valide.` }
      ], {
        json: true,
        temperature: 0.6,           // un peu plus de creativite que 0.5
        max_tokens: 600              // marge plus large que 400
      })

      usage = result.usage
      model = result.model

      // Si le contenu est vide ou tres court, on retry une fois
      if (!result.content || result.content.trim().length < 5) {
        lastError = 'reponse LLM vide'
        if (attempt < 2) {
          console.warn(`[reflect] attempt ${attempt} : reponse vide, retry...`)
          continue
        }
        break
      }

      const parsed = JSON.parse(result.content)
      parsedLessons = Array.isArray(parsed.lessons) ? parsed.lessons : []
      logUsage({ userId, endpoint: 'reflect', model, usage, statusCode: 200 })
      break  // succes, on sort de la boucle retry
    } catch (err) {
      lastError = err.message
      console.warn(`[reflect] attempt ${attempt} failed:`, err.message)
      if (attempt < 2) {
        continue  // retry
      }
    }
  }

  // Apres 2 tentatives, si toujours echec : on marque la conv reflechie quand meme
  // pour eviter de boucler dessus a chaque message de l'user (couteux en tokens)
  if (lastError && parsedLessons.length === 0) {
    await query(`UPDATE conversations SET reflected_at = NOW() WHERE id = $1`, [conversationId])
    logUsage({ userId, endpoint: 'reflect', model, usage, statusCode: 500, errorMsg: lastError })
    return { ok: false, reason: 'llm_failed_after_retry', error: lastError, lessons_inserted: 0 }
  }

  // Filtre lecons malformees
  const validLessons = parsedLessons
    .filter(l => l.lesson && typeof l.lesson === 'string' && l.lesson.length >= 10 && l.lesson.length <= 250)
    .slice(0, MAX_LESSONS_PER_REFLECTION)

  if (validLessons.length === 0) {
    await query(`UPDATE conversations SET reflected_at = NOW() WHERE id = $1`, [conversationId])
    console.log(`[reflect] user ${userId} conv ${conversationId} : 0 lecon (conv pas assez riche)`)
    return { ok: true, lessons_generated: 0, lessons_inserted: 0, lessons: [] }
  }

  // Embed batch des nouvelles lecons
  const lessonTexts = validLessons.map(l => l.lesson.trim())
  let embeddings = null
  try {
    embeddings = await embed(lessonTexts)
  } catch (err) {
    console.warn('[reflect] embed failed:', err.message)
  }

  // Dedup vectoriel
  const inserted = []
  const skipped = []

  for (let i = 0; i < validLessons.length; i++) {
    const lessonText = lessonTexts[i]
    const lessonEmb = embeddings?.[i]

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

  await query(`UPDATE conversations SET reflected_at = NOW() WHERE id = $1`, [conversationId])

  console.log(`[reflect] user ${userId} conv ${conversationId} : ${inserted.length} nouvelles + ${skipped.length} skipped`)
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