-- Migration #3 : tables RSS pour enricher N2 avec articles d'actualite
-- - rss_feeds : configuration des flux a surveiller (URL, categorie, actif/inactif)
-- - rss_articles : tracking des articles deja ingerés (deduplication par URL)
-- - lien memory_id : permet de retrouver la memoire creee a partir d'un article

CREATE TABLE IF NOT EXISTS rss_feeds (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,                       -- 'actu', 'tech', 'cyber'
  active BOOLEAN DEFAULT true,
  last_fetched_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rss_articles (
  id SERIAL PRIMARY KEY,
  feed_id INTEGER NOT NULL REFERENCES rss_feeds(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE,
  memory_id INTEGER REFERENCES memories(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- L'URL doit etre unique : on s'en sert pour la deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_rss_articles_url ON rss_articles(url);
CREATE INDEX IF NOT EXISTS idx_rss_articles_feed ON rss_articles(feed_id);
CREATE INDEX IF NOT EXISTS idx_rss_articles_published ON rss_articles(published_at DESC);

-- Seed initial : 8 flux mix actu + tech + cyber (selection Kat)
-- AlloCine, Netflix, Techniques de l'Ingenieur sont retires : pas de flux RSS officiel ou paywall
-- A ajouter plus tard via rss.app si besoin de cinema/streaming
INSERT INTO rss_feeds (url, name, category) VALUES
  ('https://www.lemonde.fr/rss/une.xml',                              'Le Monde',                'actu'),
  ('https://www.francetvinfo.fr/titres.rss',                          'France Info',             'actu'),
  ('https://www.lebigdata.fr/feed',                                   'Le Big Data',             'tech'),
  ('https://www.zdnet.fr/feeds/rss/',                                 'ZDNet France',            'tech'),
  ('https://www.frandroid.com/feed',                                  'Frandroid',               'tech'),
  ('https://www.futura-sciences.com/rss/robotique/actualites.xml',    'Futura Sciences Robotique','tech'),
  ('https://www.cert.ssi.gouv.fr/feed/',                              'CERT-FR / ANSSI',         'cyber'),
  ('https://frenchbreaches.com/feed',                                 'FrenchBreaches',          'cyber')
ON CONFLICT (url) DO NOTHING;

-- Verification de l'etat final
SELECT id, name, category, active FROM rss_feeds ORDER BY category, name;
