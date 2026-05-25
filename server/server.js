// Backend Jarvis - API REST avec auth JWT
// v6 : tutoiement + prononciation correcte des prénoms à épeler
// v7 : ajout minuteur, alarme, blagues

import express from 'express'
import cors from 'cors'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import multer from 'multer'

import { query, withTransaction } from './db.js'
import { chat, chatWithTools } from './groq.js'
import { getMemoriesContext, extractFacts } from './memory.js'
import { tavilySearch, formatSearchForLLM } from './tavily.js'
import { transcribe } from './whisper.js'

dotenv.config({ path: '../.env' })

const app = express()
const PORT = process.env.PORT || 3001

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',')
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json({ limit: '1mb' }))

// Whisper : audio reçu en multipart, gardé en mémoire (pas de disque), 25 Mo max (cap Groq)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
})

// Prononciation forcée des prénoms - permet au TTS de bien épeler
const NAME_PRONUNCIATION = {
  'Kat': 'Kate'
}

const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: `Recherche d'informations à jour sur le web. À utiliser UNIQUEMENT pour :
- Actualités récentes (post-2024)
- Informations qui changent (météo, prix, scores sportifs, cours de bourse)
- Faits, personnes, événements que tu ne connais pas
- Vérifications de dates récentes ou informations potentiellement obsolètes

À NE PAS UTILISER pour :
- Connaissances générales que tu maîtrises déjà (maths, histoire ancienne, faits classiques)
- Code, programmation, syntaxe
- Conversation casual (salutations, opinions)
- Informations personnelles de l'utilisateur (déjà dans tes mémoires)`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Requête de recherche optimisée, 3 à 7 mots clés essentiels (en français de préférence)'
        }
      },
      required: ['query']
    }
  }
}

// Outil minuteur - le déclenchement se fait côté client
// duration_seconds en string : Llama 4 envoie souvent les nombres en string, on évite l'échec de validation Groq
const SET_TIMER_TOOL = {
  type: 'function',
  function: {
    name: 'set_timer',
    description: `Démarre un minuteur (compte à rebours côté navigateur, sonne automatiquement à la fin).
À utiliser UNIQUEMENT quand l'utilisateur demande un minuteur ou un rappel dans un délai relatif.
Exemples :
- "mets-moi un minuteur de 5 minutes" -> duration_seconds=300
- "préviens-moi dans une heure et demie pour le four" -> duration_seconds=5400, label="four"
- "compte à rebours de 30 secondes" -> duration_seconds=30
- "rappelle-moi dans 2h" -> duration_seconds=7200`,
    parameters: {
      type: 'object',
      properties: {
        duration_seconds: {
          type: 'string',
          description: 'Durée totale en secondes, en chiffres uniquement (ex: "300" pour 5 minutes, "3600" pour 1 heure)'
        },
        label: {
          type: 'string',
          description: 'Description courte du minuteur (ex: "pâtes", "pause"). Vide si non précisé.'
        }
      },
      required: ['duration_seconds']
    }
  }
}

// Outil alarme - le déclenchement se fait à l'heure dite, côté client
// hour/minute en string : même raison que set_timer
const SET_ALARM_TOOL = {
  type: 'function',
  function: {
    name: 'set_alarm',
    description: `Programme une alarme à une heure précise (sonne automatiquement à l'heure dite côté navigateur).
À utiliser pour des heures absolues, pas des durées relatives.
Si l'heure est déjà passée aujourd'hui, l'alarme se déclenche le lendemain.
Exemples :
- "réveille-moi à 7h" -> hour=7, minute=0, label="réveil"
- "alarme à 14h30 pour le rendez-vous" -> hour=14, minute=30, label="rendez-vous"
- "préviens-moi à 18h15" -> hour=18, minute=15`,
    parameters: {
      type: 'object',
      properties: {
        hour: {
          type: 'string',
          description: 'Heure en chiffres uniquement, format 24h (ex: "7", "14", "23")'
        },
        minute: {
          type: 'string',
          description: 'Minute en chiffres uniquement (ex: "30", "0"). "0" par défaut si non précisé'
        },
        label: {
          type: 'string',
          description: 'Description courte de l\'alarme (ex: "réveil", "rendez-vous"). Vide si non précisé.'
        }
      },
      required: ['hour']
    }
  }
}

// ===== PERSONA v7 - tutoiement, capacités utilitaires =====
const JARVIS_PERSONA = `Tu es Jarvis, l'intelligence artificielle personnelle de l'utilisateur, inspirée de l'IA d'Iron Man.
Sophistiqué, calme, légèrement britannique d'esprit, avec un sens de l'humour bien à toi.

PERSONNALITÉ :
- Tu TUTOIES ton interlocuteur naturellement. Plus de "vous", de "Madame" ni de "Monsieur".
- Tu peux appeler la personne par son prénom de temps en temps, mais avec parcimonie.
- Ton calme, posé, jamais empressé. Sobriété assumée.

HUMOUR - PARTIE INTÉGRANTE DE TON IDENTITÉ :
- Pince-sans-rire britannique, sec et subtil, jamais bouffon ni potache.
- Ironie discrète, comme un majordome qui en a vu d'autres.
- Tu peux pointer poliment l'évident, une contradiction, ou une demande peu réfléchie.
- L'humour surgit naturellement 1 fois sur 3 ou 4 - pas à chaque phrase, sinon ça devient lourd.
- Pas d'humour sur sujets sensibles (santé, deuil, problème grave).

EXEMPLES DE TON :
- "Avec une clarté presque inquiétante."
- "Comme presque tout dans ta journée, j'imagine."
- "Une observation perspicace. Vraiment."
- "Tu pourrais. Ou tu pourrais le faire vraiment, ce qui résoudrait davantage le problème."
- "Très bien. Bien que je doute légèrement de la sagesse de cette décision."

ACCÈS WEB - tu disposes d'un outil 'web_search' :
- Utilise-le pour les informations récentes ou changeantes (actualité, météo, prix, scores, faits récents).
- Ne l'utilise JAMAIS pour ce que tu sais déjà (connaissances générales, conversation, code).
- Intègre l'info naturellement dans ta réponse, sans dire "j'ai cherché sur le web" sauf si pertinent.

CAPACITÉS UTILITAIRES :
- Minuteur (compte à rebours) : tu peux en lancer via l'outil 'set_timer' quand on te le demande explicitement ("mets un minuteur de X minutes", "préviens-moi dans Y heures", "compte à rebours de Z secondes"). Le déclenchement (sonnerie) se fait automatiquement côté navigateur, tu n'as plus à t'en soucier après.
- Alarme (heure précise) : via l'outil 'set_alarm' pour les heures absolues ("réveille-moi à 7h", "alarme à 14h30"). Idem, déclenchement automatique côté client.
- Blagues : si on te demande une blague, vas-y dans ton style pince-sans-rire britannique. Privilégie l'absurde, le jeu de mots, l'observation décalée, l'humour anglais. Pas de blagues plates Carambar ou potaches.

Après avoir lancé un minuteur ou une alarme, confirme brièvement avec ton ton habituel : "Réglé. 5 minutes." / "Très bien. Sept heures précises." / "C'est noté."

USAGE DES MÉMOIRES - RÈGLE CRUCIALE :
- Tes mémoires sont là pour répondre PRÉCISÉMENT à ce qui est demandé, pas pour étaler ce que tu sais.
- Pour les questions générales (heure, météo, calculs, faits du monde), réponds simplement sans détourner vers les projets, le partenaire ou les détails personnels.
- Tu n'invoques un détail mémorisé QUE si la question s'y rapporte DIRECTEMENT.
- Ne fais JAMAIS de suggestion non sollicitée du genre "tu pourrais discuter de X avec Y".

FORMAT DE RÉPONSE :
- Tes réponses sont lues à haute voix : zéro markdown, zéro liste à puces, zéro bloc de code.
- 1 à 2 phrases la plupart du temps. Plus long seulement si la question l'exige vraiment.
- Pas de point d'exclamation excessif. Pas d'emojis.
- Va à l'essentiel avec élégance, sans phrases d'introduction inutiles.`

function getTemporalContext() {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris'
  })
  return fmt.format(now)
}

async function getPartnerName(userId) {
  const { rows } = await query(
    `SELECT name FROM users WHERE id != $1 ORDER BY id LIMIT 1`,
    [userId]
  )
  return rows[0]?.name || null
}

// Applique la prononciation forcée pour les prénoms problématiques au TTS
function applyNamePronunciation(text) {
  if (!text) return text
  let result = text
  for (const [original, phonetic] of Object.entries(NAME_PRONUNCIATION)) {
    const regex = new RegExp(`\\b${original}\\b`, 'g')
    result = result.replace(regex, phonetic)
  }
  return result
}

// ====== AUTH MIDDLEWARE ======

function authRequired(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token manquant' })
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET)
    next()
  } catch (e) {
    res.status(401).json({ error: 'Token invalide ou expiré' })
  }
}

// ====== AUTH ROUTES ======

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' })

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()])
    if (rows.length === 0) return res.status(401).json({ error: 'Identifiants invalides' })

    const user = rows[0]
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return res.status(401).json({ error: 'Identifiants invalides' })

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } })
  } catch (err) {
    console.error('[/auth/login]', err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// ====== HELPERS CHAT ======

async function getOrCreateConversation(userId) {
  const { rows } = await query(`
    SELECT id FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1
  `, [userId])
  if (rows.length > 0) return rows[0].id

  const { rows: created } = await query(`
    INSERT INTO conversations (user_id) VALUES ($1) RETURNING id
  `, [userId])
  return created[0].id
}

// ====== CHAT ROUTE ======

app.post('/chat', authRequired, async (req, res) => {
  try {
    const { transcript } = req.body
    if (!transcript?.trim()) return res.status(400).json({ error: 'Transcript vide' })

    const userId = req.user.id
    const userName = req.user.name
    const conversationId = await getOrCreateConversation(userId)

    const { rows: history } = await query(`
      SELECT role, content FROM messages 
      WHERE conversation_id = $1 
      ORDER BY created_at DESC 
      LIMIT 10
    `, [conversationId])
    const recentMessages = history.reverse().map(m => ({ role: m.role, content: m.content }))

    const memoriesContext = await getMemoriesContext(userId)
    const temporal = getTemporalContext()
    const partnerName = await getPartnerName(userId)
    const partnerInfo = partnerName ? `Son/sa partenaire de vie s'appelle ${partnerName}.` : ''

    const pronunciationHint = NAME_PRONUNCIATION[userName]
      ? `\n\nIMPORTANT - prononciation : Le prénom "${userName}" doit être prononcé "${NAME_PRONUNCIATION[userName]}" (lettre par lettre) car le TTS le prononce mal sinon. Mais tu peux l'écrire normalement, le système remplace automatiquement.`
      : ''

    const systemPrompt = `${JARVIS_PERSONA}

=== Contexte temporel ===
Nous sommes le ${temporal} (heure de Paris).

=== Identité de l'interlocuteur ===
Tu parles à ${userName}. ${partnerInfo}${pronunciationHint}${memoriesContext}`

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentMessages,
      { role: 'user', content: transcript }
    ]

    // 3 outils disponibles : web_search, set_timer, set_alarm
    const tools = [WEB_SEARCH_TOOL, SET_TIMER_TOOL, SET_ALARM_TOOL]
    const toolExecutors = {
      web_search: async ({ query: q }) => {
        const result = await tavilySearch(q, { depth: 'basic', maxResults: 4 })
        return formatSearchForLLM(result)
      },
      // set_timer côté backend : confirme juste au LLM - le vrai minuteur tourne côté navigateur
      set_timer: ({ duration_seconds, label }) => {
        // Llama envoie souvent les nombres en string - on parse défensivement
        const sec = parseInt(duration_seconds, 10)
        if (isNaN(sec) || sec <= 0) return 'Erreur: durée invalide.'
        const m = Math.floor(sec / 60)
        const s = sec % 60
        const durStr = m ? `${m} minute(s)${s ? ` ${s} seconde(s)` : ''}` : `${s} seconde(s)`
        return `Minuteur démarré côté client pour ${durStr}${label ? ` (${label})` : ''}. Confirme brièvement et naturellement.`
      },
      set_alarm: ({ hour, minute, label }) => {
        const h = parseInt(hour, 10)
        const min = parseInt(minute, 10) || 0
        if (isNaN(h) || h < 0 || h > 23) return 'Erreur: heure invalide.'
        const mStr = min.toString().padStart(2, '0')
        return `Alarme programmée côté client à ${h}h${mStr}${label ? ` (${label})` : ''}. Confirme brièvement et naturellement.`
      }
    }

    const { content: rawReply, toolsCalled } = await chatWithTools(
      messages, tools, toolExecutors, { temperature: 0.8 }
    )

    const reply = applyNamePronunciation(rawReply)

    if (toolsCalled.length > 0) {
      console.log(`[chat] ${toolsCalled.length} appel(s) outil(s) :`,
        toolsCalled.map(t => `${t.name}(${JSON.stringify(t.args).slice(0, 60)})`).join(', '))
    }

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
        [conversationId, transcript, rawReply]
      )
      await client.query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId])

      for (const tc of toolsCalled.filter(t => t.name === 'web_search')) {
        await client.query(`
          INSERT INTO memories (user_id, fact, category, importance, shared)
          VALUES ($1, $2, 'web_research', 5, false)
        `, [userId, `A recherché "${tc.args.query}" le ${new Date().toLocaleDateString('fr-FR')}`])
      }
    })

    extractFacts(userId, transcript, rawReply).catch(e => console.warn('extract bg:', e.message))

    // Extrait les appels timer/alarm pour que le frontend puisse créer les vrais déclencheurs
    // parseInt nécessaire : on stocke en string côté Groq mais le frontend attend des int
    const timerCall = toolsCalled.find(t => t.name === 'set_timer')
    const alarmCall = toolsCalled.find(t => t.name === 'set_alarm')

    res.json({
      reply,
      searched: toolsCalled.some(t => t.name === 'web_search'),
      timer: timerCall ? {
        duration_seconds: parseInt(timerCall.args.duration_seconds, 10),
        label: timerCall.args.label || null
      } : null,
      alarm: alarmCall ? {
        hour: parseInt(alarmCall.args.hour, 10),
        minute: parseInt(alarmCall.args.minute, 10) || 0,
        label: alarmCall.args.label || null
      } : null
    })
  } catch (err) {
    console.error('[/chat]', err)
    res.status(500).json({ error: 'Erreur serveur', detail: err.message })
  }
})

// ====== TRANSCRIBE ROUTE ======
// Audio -> texte via Whisper Groq. Le front rappellera ensuite /chat avec le texte obtenu.
app.post('/transcribe', authRequired, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file?.buffer?.length) return res.status(400).json({ error: 'Fichier audio manquant' })

    const t0 = Date.now()
    const text = await transcribe(req.file.buffer, {
      filename: req.file.originalname || 'voice.webm',
      language: 'fr'
    })
    console.log(`[transcribe] ${req.file.size}B -> "${text.slice(0, 60)}" (${Date.now() - t0}ms)`)

    res.json({ text })
  } catch (err) {
    console.error('[/transcribe]', err)
    res.status(500).json({ error: 'Erreur transcription', detail: err.message })
  }
})

app.get('/history', authRequired, async (req, res) => {
  try {
    const conversationId = await getOrCreateConversation(req.user.id)
    const { rows } = await query(`
      SELECT role, content, created_at FROM messages 
      WHERE conversation_id = $1 
      ORDER BY created_at ASC
    `, [conversationId])
    res.json({ messages: rows })
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

app.get('/memories', authRequired, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT m.id, m.fact, m.category, m.importance, m.shared, m.created_at,
             u.name as owner_name
      FROM memories m
      JOIN users u ON u.id = m.user_id
      WHERE m.user_id = $1 OR m.shared = true
      ORDER BY m.importance DESC, m.created_at DESC
    `, [req.user.id])
    res.json({ memories: rows })
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

app.get('/health', (req, res) => res.json({ ok: true, t: Date.now() }))

app.listen(PORT, () => {
  console.log(`\n=== Jarvis API ===`)
  console.log(`Port      : ${PORT}`)
  console.log(`LLM       : Groq`)
  console.log(`Whisper   : whisper-large-v3-turbo (via Groq)`)
  console.log(`Web search: ${process.env.TAVILY_API_KEY ? 'Tavily activé' : 'NON CONFIGURÉ ⚠️'}`)
  console.log(`DB        : ${process.env.DATABASE_URL ? 'connectée' : 'NON CONFIGURÉE ⚠️'}`)
  console.log(`JWT       : ${process.env.JWT_SECRET?.length >= 32 ? 'OK' : 'TROP COURT ⚠️'}`)
  console.log(`Persona   : Jarvis Stark v7 (tutoiement + prononciation + minuteur/alarme/blagues)`)
  console.log(`Temporal  : ${getTemporalContext()}\n`)
})