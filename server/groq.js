// Service Groq - compatible OpenAI Chat Completions
// v2 : ajout de chatWithTools pour function calling (Tavily web search)

import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'

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

// Version simple sans tools - utilisée pour l'extraction de faits
export async function chat(messages, options = {}) {
  const data = await callGroq({
    model: MODEL,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 800,
    response_format: options.json ? { type: 'json_object' } : undefined
  })
  return data.choices[0].message.content
}

// Version avec function calling - boucle automatique tool_call -> tool_result -> réponse finale
// toolExecutors = { 'web_search': async ({ query }) => 'résultat formaté en string' }
export async function chatWithTools(messages, tools, toolExecutors, options = {}) {
  let currentMessages = [...messages]
  const toolsCalled = []
  const MAX_ITERATIONS = 3  // sécurité anti boucle infinie

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

    // Pas de tool_call : réponse finale prête
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return { content: message.content || '', toolsCalled }
    }

    // Le LLM veut appeler un ou plusieurs tools - on push son message dans l'historique
    currentMessages.push(message)

    // Exécution séquentielle des tools demandés
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
        toolResult = `Erreur lors de l'appel à ${fnName}: ${err.message}`
      }

      toolsCalled.push({ name: fnName, args: fnArgs, result: toolResult })

      currentMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: toolResult
      })
    }
  }

  // Si on atteint MAX_ITERATIONS sans réponse finale - improbable mais safe
  return { content: "Désolé, je n'ai pas pu finaliser ma réponse.", toolsCalled }
}