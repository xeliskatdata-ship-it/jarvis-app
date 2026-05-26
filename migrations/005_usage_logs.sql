-- Migration #5 : table usage_logs pour audit et quotas
-- - log d'un INSERT par appel d'API LLM (Groq) ou Whisper ou Tavily
-- - user_id nullable car certains appels (RSS refresh) n'ont pas d'user
-- - on stocke aussi les erreurs pour faciliter le debug et detecter les anomalies

CREATE TABLE IF NOT EXISTS usage_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  endpoint VARCHAR(50) NOT NULL,                       -- 'chat', 'transcribe', 'extract_facts', 'rss_refresh', etc.
  model VARCHAR(100),                                  -- 'llama-3.3-70b-versatile', 'whisper-large-v3-turbo', 'mistral-embed'
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  status_code INTEGER,                                 -- 200, 401, 429, 500...
  error_msg TEXT,                                      -- message si echec
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les queries quota (par user, sur la journee courante)
CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_logs(user_id, created_at DESC);
-- Index pour les queries d'agregation par endpoint (dashboard admin)
CREATE INDEX IF NOT EXISTS idx_usage_endpoint_date ON usage_logs(endpoint, created_at DESC);
-- Index pour le cleanup periodique (logs > 90 jours)
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_logs(created_at DESC);

-- Verification
SELECT COUNT(*) AS rows FROM usage_logs;
