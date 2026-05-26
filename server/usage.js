// Module audit & quotas
// - logUsage : INSERT dans usage_logs (appele apres chaque appel d'API externe)
// - checkQuota : verifie qu'un user n'a pas depasse son quota tokens du jour
// - getAdminStats : agregats pour le dashboard /admin/usage

import { query } from './db.js'

// Quota tokens / user / jour (reset a minuit UTC)
// 200k = genereux pour 2 users sur free tier Groq Llama 3.3 70B (~500k/jour limite)
export const DAILY_QUOTA_TOKENS = 200_000

// Seuil d'alerte global : si conso tous users + RSS > X tokens/jour, console.warn
// Permet d'anticiper avant que Groq nous coupe
export const ALERT_GLOBAL_THRESHOLD = 1_000_000

// === Log d'un appel ===
// usage = { prompt_tokens, completion_tokens, total_tokens } (format API Groq/OpenAI)
// userId peut etre null (RSS refresh, jobs cron)
export async function logUsage({ userId = null, endpoint, model = null, usage = {}, statusCode = 200, errorMsg = null }) {
  const promptT = usage?.prompt_tokens || 0
  const completionT = usage?.completion_tokens || 0
  const totalT = usage?.total_tokens || (promptT + completionT)

  try {
    await query(`
      INSERT INTO usage_logs (user_id, endpoint, model, prompt_tokens, completion_tokens, total_tokens, status_code, error_msg)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [userId, endpoint, model, promptT, completionT, totalT, statusCode, errorMsg])
  } catch (err) {
    // Le log d'usage ne doit JAMAIS casser une requete utilisateur
    console.warn('[usage] log echoue:', err.message)
  }
}

// === Check quota user (jour courant) ===
// Retourne { used, limit, remaining, exceeded }
export async function checkQuota(userId) {
  if (!userId) return { used: 0, limit: DAILY_QUOTA_TOKENS, remaining: DAILY_QUOTA_TOKENS, exceeded: false }

  const { rows } = await query(`
    SELECT COALESCE(SUM(total_tokens), 0)::int AS total
    FROM usage_logs
    WHERE user_id = $1
      AND created_at >= CURRENT_DATE
      AND status_code = 200
  `, [userId])

  const used = rows[0].total
  return {
    used,
    limit: DAILY_QUOTA_TOKENS,
    remaining: Math.max(0, DAILY_QUOTA_TOKENS - used),
    exceeded: used >= DAILY_QUOTA_TOKENS
  }
}

// === Stats admin agrégées ===
// Renvoie un objet structurel pour /admin/usage
export async function getAdminStats() {
  // Totaux du jour
  const { rows: todayRows } = await query(`
    SELECT 
      COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
      COUNT(*)::int AS total_calls,
      COUNT(DISTINCT user_id)::int AS unique_users,
      COUNT(*) FILTER (WHERE status_code != 200)::int AS errors
    FROM usage_logs
    WHERE created_at >= CURRENT_DATE
  `)

  // Conso par user (incluant ceux a 0 pour affichage propre)
  const { rows: byUser } = await query(`
    SELECT 
      u.id, u.name, u.email,
      COUNT(ul.id)::int AS calls,
      COALESCE(SUM(ul.total_tokens), 0)::int AS tokens
    FROM users u
    LEFT JOIN usage_logs ul ON ul.user_id = u.id AND ul.created_at >= CURRENT_DATE
    GROUP BY u.id, u.name, u.email
    ORDER BY tokens DESC
  `)

  // Conso par endpoint
  const { rows: byEndpoint } = await query(`
    SELECT 
      endpoint,
      COUNT(*)::int AS calls,
      COALESCE(SUM(total_tokens), 0)::int AS tokens
    FROM usage_logs
    WHERE created_at >= CURRENT_DATE
    GROUP BY endpoint
    ORDER BY tokens DESC
  `)

  // Historique 7 derniers jours pour tendance
  const { rows: last7days } = await query(`
    SELECT 
      DATE(created_at) AS day,
      COUNT(*)::int AS calls,
      COALESCE(SUM(total_tokens), 0)::int AS tokens
    FROM usage_logs
    WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY DATE(created_at)
    ORDER BY day DESC
  `)

  // Erreurs recentes (24h) pour debug
  const { rows: recentErrors } = await query(`
    SELECT 
      created_at,
      endpoint,
      status_code,
      LEFT(error_msg, 200) AS error_msg
    FROM usage_logs
    WHERE status_code != 200
      AND created_at >= NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
    LIMIT 20
  `)

  const today = todayRows[0]

  return {
    today,
    quota_per_user: DAILY_QUOTA_TOKENS,
    alert_threshold_global: ALERT_GLOBAL_THRESHOLD,
    alert_triggered: today.total_tokens >= ALERT_GLOBAL_THRESHOLD,
    by_user: byUser,
    by_endpoint: byEndpoint,
    last_7_days: last7days,
    recent_errors: recentErrors
  }
}

// === Cleanup : supprime les logs > 90 jours (optionnel, a appeler depuis un cron) ===
export async function cleanupOldLogs(daysToKeep = 90) {
  const { rowCount } = await query(`
    DELETE FROM usage_logs 
    WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
  `)
  if (rowCount > 0) {
    console.log(`[usage cleanup] ${rowCount} logs supprimes (>${daysToKeep}j)`)
  }
  return rowCount
}
