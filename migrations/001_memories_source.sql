-- Migration #1 : distinction mémoires explicites (N1) vs auto-extraites
-- À exécuter dans le SQL Editor de Neon

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'auto';

COMMENT ON COLUMN memories.source IS
  'auto = extrait en background apres echange, explicit = demande directe "souviens-toi que..."';

-- Index pour filtrer rapidement par source (utile dans l'UI /memories)
CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source);

-- Toutes les memoires existantes sont taggees 'auto' par defaut (DEFAULT), rien a backfiller
-- Verification rapide
SELECT source, COUNT(*) FROM memories GROUP BY source;
