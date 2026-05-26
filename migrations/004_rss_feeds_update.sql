-- Migration #4 : retire les flux RSS morts et ajoute cinema + robotique/tech avance

-- Supprime les flux desactives faute de RSS dispo (cleanup des essais)
-- Cascade : les rss_articles lies sont supprimes automatiquement (ON DELETE CASCADE)
-- Note : les memoires deja creees ne sont PAS supprimees (elles restent dans memories)
DELETE FROM rss_feeds 
  WHERE name IN ('Futura Sciences Robotique', 'FrenchBreaches');

-- Ajoute les 2 nouveaux flux trouves
-- AlloCine : URL officielle (validee sur leur page service/rss)
-- Futura High-Tech : couvre robotique, IA, tech avance (Futura n'a plus de rubrique robotique dediee en RSS)
INSERT INTO rss_feeds (url, name, category) VALUES
  ('https://www.allocine.fr/rss/news-cine.xml',                    'AlloCiné News Ciné', 'cinema'),
  ('https://www.futura-sciences.com/rss/high-tech/actualites.xml', 'Futura High-Tech',   'tech')
ON CONFLICT (url) DO NOTHING;

-- Verification
SELECT id, name, category, active FROM rss_feeds ORDER BY category, name;
