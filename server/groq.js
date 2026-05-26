// Service Groq - compatible OpenAI Chat Completions
// v2 : ajout de chatWithTools pour function calling (Tavily web search)
// v3 : switch vers Llama 3.3 70B + option light model pour optimiser tokens

import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Modele principal : Llama 3.3 70B versatile
// - Tool calling solide (#1 sur BFCL parmi les modeles open-source)
// - Quota free tier separe de Llama 4 (= debloque la situation actuelle de Kat)
// - 128k context
const MODEL = 'openai/gpt-oss-120b'

// Modele leger pour taches structurees en background (extraction de faits)
// ~9x moins de tokens consommes que le 70B, qualite suffisante sur JSON extraction
// Pas active par defaut - utiliser options.light = true pour l'activer
const MODEL_LIGHT = 'llama-3.1-8b-instant'

// Alternatives prod en cas de rate-limit futur sur llama-3.3-70b :
// - meta-llama/llama-4-scout-17b-16e-instruct (Llama 4 Scout - notre ancien)
// - meta-llama/llama-4-maverick-17b-128e-instruct (Llama 4 Maverick)
// - openai/gpt-oss-120b (modele OpenAI open-weight, contexte 128k+)
// - groq/compound (Compound : web_search + code execution integres - virerait Tavily)

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

// Version simple sans tools - utilisee pour l'extraction de faits
// options.light = true pour utiliser le modele 8B (economise tokens sur taches structurees)
export async function chat(messages, options = {}) {
  const data = await callGroq({
    model: options.light ? MODEL_LIGHT : MODEL,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 800,
    response_format: options.json ? { type: 'json_object' } : undefined
  })
  return data.choices[0].message.content
}

// Version avec function calling - boucle automatique tool_call -> tool_result -> reponse finale
// toolExecutors = { 'web_search': async ({ query }) => 'resultat formate en string' }
export async function chatWithTools(messages, tools, toolExecutors, options = {}) {
  let currentMessages = [...messages]
  const toolsCalled = []
  const MAX_ITERATIONS = 3  // securite anti boucle infinie

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const data = await callGroq({
      model: MODEL,
      messages: currentMessages,
      tools,
      tool_choice: 'auto',
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 800
    })

    const message = data.choices[0].message

    // Pas de tool_call : reponse finale prete
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return { content: message.content || '', toolsCalled }
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
  return { content: "Desole, je n'ai pas pu finaliser ma reponse.", toolsCalled }
}