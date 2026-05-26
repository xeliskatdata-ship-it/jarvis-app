-- Migration #6 : auto-reflexion (N4) - tracking des conversations deja reflechies
-- - reflected_at : timestamp de la derniere reflexion sur cette conv (NULL = jamais)
-- - index partiel : optimise la query "conv dormante non reflechie" sur /chat
-- - les memoires creees auront source='reflection' (deja accepte par le schema, pas de migration)

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS reflected_at TIMESTAMP WITH TIME ZONE;

-- Index partiel : ne contient que les lignes NULL (les conv non reflechies)
-- Tres efficace pour le check "y a-t-il une conv dormante a reflechir ?"
CREATE INDEX IF NOT EXISTS idx_conversations_not_reflected 
  ON conversations(user_id, updated_at) 
  WHERE reflected_at IS NULL;

-- Verification
SELECT 
  COUNT(*) AS total_conversations,
  COUNT(reflected_at) AS already_reflected,
  COUNT(*) - COUNT(reflected_at) AS to_reflect_eventually
FROM conversations;
