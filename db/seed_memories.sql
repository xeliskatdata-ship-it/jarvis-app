-- Pré-injection de mémoires initiales pour Jarvis
-- À exécuter UNE SEULE FOIS dans Neon SQL Editor, après le seed des users.

-- ==========================================================================
-- KAT - faits personnels (privés, non partagés)
-- ==========================================================================
INSERT INTO memories (user_id, fact, category, importance, shared)
SELECT u.id, x.fact, x.category, x.importance, x.shared
FROM users u
CROSS JOIN (VALUES
  ('est data analyst junior, promotion 2026', 'personal_fact', 9, false),
  ('travaille principalement en français mais lit et code en anglais', 'personal_fact', 5, false),
  ('utilise Windows 11 avec VS Code et Git Bash comme environnement de développement', 'preference', 5, false),
  ('préfère un style de code notebook : direct, concis, sans docstrings académiques', 'preference', 6, false),
  ('apprécie les commentaires courts façon "notes de terrain"', 'preference', 5, false),
  ('développe StatCyberMatrix, une plateforme de veille cyber automatisée déployée sur Streamlit Cloud + Neon', 'project', 8, false),
  ('a migré StatCyberMatrix vers une architecture cloud (Neon Postgres + GitHub Actions + Streamlit Cloud)', 'project', 6, false),
  ('communique de manière directe et préfère les conseils orientés action sans explications superflues', 'preference', 7, false)
) AS x(fact, category, importance, shared)
WHERE u.email = 'kat@jarvis.local';

-- ==========================================================================
-- BRICE - faits personnels (privés, non partagés)
-- ==========================================================================
INSERT INTO memories (user_id, fact, category, importance, shared)
SELECT u.id, x.fact, x.category, x.importance, x.shared
FROM users u
CROSS JOIN (VALUES
  ('s''occupe du hardware, de la construction physique et du firmware Arduino du robot WALL-E', 'personal_fact', 8, false),
  ('maîtrise la modélisation 3D et l''assemblage électronique', 'personal_fact', 7, false)
) AS x(fact, category, importance, shared)
WHERE u.email = 'brice@jarvis.local';

-- ==========================================================================
-- FAITS PARTAGÉS (couple, projets communs) - stockés sur Kat avec shared=true
-- Brice y aura accès aussi quand il se connectera
-- ==========================================================================
INSERT INTO memories (user_id, fact, category, importance, shared)
SELECT u.id, x.fact, x.category, x.importance, x.shared
FROM users u
CROSS JOIN (VALUES
  ('Kat et Brice sont en couple', 'relationship', 10, true),
  ('Kat et Brice développent ensemble un robot compagnon intelligent nommé WALL-E (65 cm, multi-utilisateurs famille)', 'project', 10, true),
  ('Le robot WALL-E tourne 100% offline : Raspberry Pi 5 (NVMe) + Arduino Mega2560 + Ollama avec qwen2.5', 'project', 8, true),
  ('Sur WALL-E : Kat gère le software, l''IA et l''architecture ; Brice gère le hardware, le firmware et la construction physique', 'project', 8, true),
  ('Le projet WALL-E inclut un système de mémoire ChromaDB avec ACL pour gérer six profils familiaux et invités', 'project', 7, true)
) AS x(fact, category, importance, shared)
WHERE u.email = 'kat@jarvis.local';

-- ==========================================================================
-- Vérification (cette requête renvoie un tableau récap après les INSERT)
-- ==========================================================================
SELECT u.name, COUNT(m.id) AS nb_memories,
       SUM(CASE WHEN m.shared THEN 1 ELSE 0 END) AS shared_count
FROM users u
LEFT JOIN memories m ON m.user_id = u.id
GROUP BY u.id, u.name
ORDER BY u.name;