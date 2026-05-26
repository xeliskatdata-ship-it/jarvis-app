// Module RSS context enricher
// - refreshAllFeeds : fetch tous les flux actifs, embed et insert les nouveaux articles
// - cleanupOldArticles : supprime articles + memoires associees > 30 jours
// Auto-desactive un flux qui plante (404, XML invalide) - relancer manuellement avec active=true
// v2 : safeParseDate pour gerer le format date francais RFC 822 (cas ZDNet "lun, 25 Mai 2026...")

import Parser from 'rss-parser'
import { query } from './db.js'
import { embed, toPgVector } from './mistral.js'

const parser = new Parser({
  timeout: 10000,                                      // 10s max par flux
  headers: { 'User-Agent': 'JarvisRSS/1.0' }
})

const ARTICLE_MAX_AGE_DAYS = 30                        // au-dela, cleanup
const MAX_ARTICLES_PER_FEED = 20                       // limite par refresh, evite inondation a la 1ere ingestion

// Parse une date avec fallback francais
// Tentative 1 : new Date() standard (couvre 95% des cas - ISO, RFC 822 EN, etc.)
// Tentative 2 : remap mois/jours FR -> EN puis re-parse (ex ZDNet : "lun, 25 Mai 2026 17:38:16 +0200")
// Fallback : null (la colonne accepte NULL, on perd la date mais on garde l'article)
function safeParseDate(dateStr) {
  if (!dateStr) return null

  let d = new Date(dateStr)
  if (!isNaN(d.getTime())) return d.toISOString()

  // Remap FR -> EN pour le format RFC 822 francais
  const remapped = dateStr
    .replace(/^(lun|mar|mer|jeu|ven|sam|dim)\.?,/i, 'Mon,')   // jour (peu importe lequel, on garde Mon)
    .replace(/\bjanv?\.?\b/i, 'Jan')
    .replace(/\bf[ée]vr?\.?\b/i, 'Feb')
    .replace(/\bmars\b/i, 'Mar')
    .replace(/\bavr\.?\b/i, 'Apr')
    .replace(/\bmai\b/i, 'May')
    .replace(/\bjuin\b/i, 'Jun')
    .replace(/\bjuil\.?\b/i, 'Jul')
    .replace(/\bao[ûu]t\b/i, 'Aug')
    .replace(/\bsept?\.?\b/i, 'Sep')
    .replace(/\boct\.?\b/i, 'Oct')
    .replace(/\bnov\.?\b/i, 'Nov')
    .replace(/\bd[ée]c\.?\b/i, 'Dec')

  d = new Date(remapped)
  return !isNaN(d.getTime()) ? d.toISOString() : null
}

// Fetch + parse un flux RSS (ne throw jamais, retourne { ok, items|error })
async function fetchFeed(feedUrl) {
  try {
    const feed = await parser.parseURL(feedUrl)
    return { ok: true, items: feed.items || [] }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

// Filtre les articles deja en DB (deduplication par URL)
async function filterNewArticles(items) {
  if (items.length === 0) return []
  const urls = items.map(i => i.link).filter(Boolean)
  if (urls.length === 0) return []

  const { rows } = await query(
    `SELECT url FROM rss_articles WHERE url = ANY($1::text[])`,
    [urls]
  )
  const existing = new Set(rows.map(r => r.url))
  return items.filter(i => i.link && !existing.has(i.link))
}

// Insere les memoires + le tracking rss_articles
// Embed batch : 1 appel Mistral pour tous les titres d'un flux
async function ingestArticles(feedId, articles, userId) {
  if (articles.length === 0) return 0

  const memoryTexts = articles.map(a => {
    const title = (a.title || 'Sans titre').trim().slice(0, 300)
    return `${title} - lien: ${a.link}`
  })

  let embeddings = null
  try {
    embeddings = await embed(memoryTexts)
  } catch (err) {
    console.warn(`[rss] embedding feed ${feedId} echoue (continue sans):`, err.message)
  }

  let inserted = 0
  for (let i = 0; i < articles.length; i++) {
    const a = articles[i]
    const pubDate = safeParseDate(a.pubDate || a.isoDate)   // <-- fix ZDNet ici
    const title = (a.title || 'Sans titre').trim().slice(0, 500)

    try {
      let memId = null
      if (embeddings) {
        const { rows } = await query(`
          INSERT INTO memories (user_id, fact, category, importance, shared, source, embedding)
          VALUES ($1, $2, 'news', 3, true, 'rss', $3::vector)
          RETURNING id
        `, [userId, memoryTexts[i], toPgVector(embeddings[i])])
        memId = rows[0].id
      } else {
        const { rows } = await query(`
          INSERT INTO memories (user_id, fact, category, importance, shared, source)
          VALUES ($1, $2, 'news', 3, true, 'rss')
          RETURNING id
        `, [userId, memoryTexts[i]])
        memId = rows[0].id
      }

      await query(`
        INSERT INTO rss_articles (feed_id, url, title, published_at, memory_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (url) DO NOTHING
      `, [feedId, a.link, title, pubDate, memId])

      inserted++
    } catch (err) {
      console.warn(`[rss] insert article echoue (${a.link?.slice(0, 60)}):`, err.message)
    }
  }

  return inserted
}

async function cleanupOldArticles() {
  const { rowCount: memCount } = await query(`
    DELETE FROM memories 
    WHERE id IN (
      SELECT memory_id FROM rss_articles 
      WHERE created_at < NOW() - INTERVAL '${ARTICLE_MAX_AGE_DAYS} days'
      AND memory_id IS NOT NULL
    )
  `)

  const { rowCount: articleCount } = await query(`
    DELETE FROM rss_articles 
    WHERE created_at < NOW() - INTERVAL '${ARTICLE_MAX_AGE_DAYS} days'
  `)

  if (memCount + articleCount > 0) {
    console.log(`[rss cleanup] ${memCount} memoires + ${articleCount} articles supprimes (>${ARTICLE_MAX_AGE_DAYS}j)`)
  }
  return { memCount, articleCount }
}

export async function refreshAllFeeds(userId = 1) {
  const t0 = Date.now()

  const { rows: feeds } = await query(`
    SELECT id, name, url, category FROM rss_feeds WHERE active = true ORDER BY id
  `)

  if (feeds.length === 0) {
    return { ok: true, message: 'Aucun flux actif', stats: [] }
  }

  console.log(`[rss] refresh de ${feeds.length} flux actifs...`)

  const fetchPromises = feeds.map(async (feed) => {
    const result = await fetchFeed(feed.url)
    return { feed, result }
  })
  const fetchResults = await Promise.all(fetchPromises)

  const stats = []
  for (const { feed, result } of fetchResults) {
    if (!result.ok) {
      console.warn(`[rss] ${feed.name} (id=${feed.id}) ECHEC: ${result.error}`)
      await query(`UPDATE rss_feeds SET active = false WHERE id = $1`, [feed.id])
      stats.push({ feed: feed.name, status: 'error_disabled', error: result.error, inserted: 0 })
      continue
    }

    const limitedItems = result.items.slice(0, MAX_ARTICLES_PER_FEED)
    const newItems = await filterNewArticles(limitedItems)
    const inserted = await ingestArticles(feed.id, newItems, userId)

    await query(`UPDATE rss_feeds SET last_fetched_at = NOW() WHERE id = $1`, [feed.id])

    stats.push({
      feed: feed.name,
      category: feed.category,
      status: 'ok',
      fetched: limitedItems.length,
      new: newItems.length,
      inserted
    })
    console.log(`[rss] ${feed.name}: fetched=${limitedItems.length} new=${newItems.length} inserted=${inserted}`)
  }

  const cleanup = await cleanupOldArticles()
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`[rss] refresh termine en ${elapsed}s`)

  return {
    ok: true,
    elapsed_seconds: parseFloat(elapsed),
    feeds_processed: feeds.length,
    cleanup,
    stats
  }
}
