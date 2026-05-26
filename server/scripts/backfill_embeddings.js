// Calcule et stocke les embeddings pour toutes les memoires existantes
// One-shot, a lancer depuis la racine du projet :
//   node server/scripts/backfill_embeddings.js
//
// Si interrompu : relancer simplement, on ne traite que les memoires NULL

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Charge .env depuis la racine (server/scripts/ -> server/ -> racine)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

// Import dynamique APRES dotenv.config pour que le pool PG s'instancie avec les bonnes vars
const { query, pool } = await import('../db.js')
const { embed, toPgVector } = await import('../mistral.js')

const BATCH_SIZE = 32       // Mistral accepte jusqu'a 512 inputs/req mais 32 = sweet spot latence
const PAUSE_MS = 300        // Petite pause entre batchs pour ne pas saturer le rate limit free tier

async function main() {
  console.log('[backfill] connexion DB...')

  const { rows } = await query(`
    SELECT id, fact FROM memories 
    WHERE embedding IS NULL 
    ORDER BY id
  `)

  if (rows.length === 0) {
    console.log('[backfill] aucune memoire a traiter (toutes ont deja un embedding)')
    await pool.end()
    return
  }

  console.log(`[backfill] ${rows.length} memoires a embedder en batchs de ${BATCH_SIZE}`)
  const t0 = Date.now()
  let done = 0
  let failed = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const texts = batch.map(r => r.fact)

    try {
      const embeddings = await embed(texts)

      // Updates paralleles - rapide car peu de lignes par batch
      await Promise.all(batch.map((row, idx) =>
        query(
          `UPDATE memories SET embedding = $1::vector WHERE id = $2`,
          [toPgVector(embeddings[idx]), row.id]
        )
      ))

      done += batch.length
      const pct = ((done / rows.length) * 100).toFixed(1)
      console.log(`[backfill] ${done}/${rows.length} (${pct}%)`)
    } catch (err) {
      failed += batch.length
      console.error(`[backfill] erreur batch ${i}-${i + batch.length}:`, err.message)
      // On continue avec les batchs suivants - relancer le script retentera les rates
    }

    // Pause entre batchs : eviter rate limit Mistral free tier
    if (i + BATCH_SIZE < rows.length) {
      await new Promise(r => setTimeout(r, PAUSE_MS))
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\n[backfill] termine en ${elapsed}s`)
  console.log(`[backfill] reussi : ${done} / echec : ${failed}`)

  // Verification finale
  const { rows: check } = await query(`
    SELECT 
      COUNT(*) AS total,
      COUNT(embedding) AS with_embed,
      COUNT(*) - COUNT(embedding) AS sans_embed
    FROM memories
  `)
  console.log('[backfill] etat final :', check[0])

  await pool.end()
}

main().catch(async err => {
  console.error('[backfill] erreur fatale:', err)
  try { await pool.end() } catch {}
  process.exit(1)
})
