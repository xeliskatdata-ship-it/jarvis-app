-- Migration #2 : memoire vectorielle (N2)
-- Active pgvector, ajoute la colonne embedding (Mistral = 1024 dims), cree l'index HNSW

CREATE EXTENSION IF NOT EXISTS vector;

-- mistral-embed retourne des vecteurs de 1024 dimensions float
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- Index HNSW pour recherche cosine rapide (pgvector 0.8.0+)
-- HNSW = Hierarchical Navigable Small World : approximate top-k tres rapide en lecture
-- vector_cosine_ops : on calcule la similarite cosinus
-- Defauts m=16 / ef_construction=64 : optimaux pour notre volume
CREATE INDEX IF NOT EXISTS idx_memories_embedding_hnsw 
  ON memories USING hnsw (embedding vector_cosine_ops);

-- Etat actuel : combien de memoires ont deja un embedding ?
SELECT 
  COUNT(*) AS total_memories,
  COUNT(embedding) AS with_embedding,
  COUNT(*) - COUNT(embedding) AS to_backfill
FROM memories;
