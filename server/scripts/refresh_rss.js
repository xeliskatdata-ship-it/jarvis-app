// Test local du refresh RSS - lance directement depuis la racine du projet :
//   node server/scripts/refresh_rss.js
//
// Si un flux plante, il est auto-desactive en DB. Pour le reactiver :
//   UPDATE rss_feeds SET active = true WHERE id = X;

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const { refreshAllFeeds } = await import('../rss.js')
const { pool } = await import('../db.js')

async function main() {
  console.log('[refresh_rss] demarrage...')
  const result = await refreshAllFeeds(1)  // user_id=1 (Kat) comme owner

  console.log('\n=== RESULTAT ===')
  console.log(JSON.stringify(result, null, 2))

  // Recap visuel
  if (result.stats?.length > 0) {
    console.log('\n=== RECAP PAR FLUX ===')
    for (const s of result.stats) {
      const icon = s.status === 'ok' ? 'OK ' : 'KO '
      const detail = s.status === 'ok'
        ? `fetched=${s.fetched} new=${s.new} inserted=${s.inserted}`
        : `${s.error}`
      console.log(`  ${icon} ${s.feed.padEnd(30)} ${detail}`)
    }
  }

  await pool.end()
}

main().catch(async err => {
  console.error('[refresh_rss] erreur fatale:', err)
  try { const { pool } = await import('../db.js'); await pool.end() } catch {}
  process.exit(1)
})