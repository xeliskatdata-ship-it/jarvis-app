// Service Groq - compatible OpenAI Chat Completions
// v2 : ajout de chatWithTools pour function calling (Tavily web search)
// v3 : switch vers Llama 3.3 70B + option light model pour optimiser tokens
// v4 : switch vers GPT-OSS 120B + retour { content, usage, model } pour tracking S3

import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Modele principal : GPT-OSS 120B (OpenAI open-weight via Groq)
// Quota separe de Llama 3.3 et Llama 4 - quota Llama 3.3 epuise le 26/05/2026
const MODEL = 'openai/gpt-oss-120b'

// Modele leger pour taches structurees en background (extraction de faits)
// ~9x moins de tokens consommes, qualite suffisante sur JSON extraction
const MODEL_LIGHT = 'llama-3.1-8b-instant'

// Forme par defaut d'un usage Groq (compatible OpenAI : prompt_tokens, completion_tokens, total_tokens)
const EMPTY_USAGE = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

async function callGroq(payload) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq ${res.status}: ${err.slice(0, 200)}`)
  }

  return res.json()
}

// Version simple sans tools - retourne { content, usage, model } pour tracking
// options.light = true pour utiliser le modele 8B (economise tokens sur taches structurees)
export async function chat(messages, options = {}) {
  const usedModel = options.light ? MODEL_LIGHT : MODEL
  const data = await callGroq({
    model: usedModel,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 800,
    response_format: options.json ? { type: 'json_object' } : undefined
  })
  return {
    content: data.choices[0].message.content,
    usage: data.usage || { ...EMPTY_USAGE },
    model: usedModel
  }
}

// Version avec function calling - boucle automatique tool_call -> tool_result -> reponse finale
// Retourne { content, usage, model, toolsCalled } - usage = somme des iterations
export async function chatWithTools(messages, tools, toolExecutors, options = {}) {
  let currentMessages = [...messages]
  const toolsCalled = []
  // Cumul de l'usage sur toutes les iterations LLM (1 appel /chat = potentiellement N appels Groq)
  const totalUsage = { ...EMPTY_USAGE }
  const MAX_ITERATIONS = 3

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const data = await callGroq({
      model: MODEL,
      messages: currentMessages,
      tools,
      tool_choice: 'auto',
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 800
    })

    // Accumulation usage
    if (data.usage) {
      totalUsage.prompt_tokens += data.usage.prompt_tokens || 0
      totalUsage.completion_tokens += data.usage.completion_tokens || 0
      totalUsage.total_tokens += data.usage.total_tokens || 0
    }

    const message = data.choices[0].message

    // Pas de tool_call : reponse finale prete
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return { content: message.content || '', usage: totalUsage, model: MODEL, toolsCalled }
    }

    // Le LLM veut appeler un ou plusieurs tools - on push son message dans l'historique
    currentMessages.push(message)

    // Execution sequentielle des tools demandes
    for (const tc of message.tool_calls) {
      const fnName = tc.function.name
      let fnArgs = {}
      try { fnArgs = JSON.parse(tc.function.arguments || '{}') } catch {}

      console.log(`[tool] ${fnName} args=${JSON.stringify(fnArgs)}`)

      let toolResult = ''
      try {
        if (toolExecutors[fnName]) {
          toolResult = await toolExecutors[fnName](fnArgs)
        } else {
          toolResult = `Tool ${fnName} non disponible.`
        }
      } catch (err) {
        toolResult = `Erreur lors de l'appel a ${fnName}: ${err.message}`
      }

      toolsCalled.push({ name: fnName, args: fnArgs, result: toolResult })

      currentMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: toolResult
      })
    }
  }

  // Si on atteint MAX_ITERATIONS sans reponse finale - improbable mais safe
  return {
    content: "Desole, je n'ai pas pu finaliser ma reponse.",
    usage: totalUsage,
    model: MODEL,
    toolsCalled
  }
}
