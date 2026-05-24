-- Utilisateurs : Kat & Brice pour l'instant
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Une conversation = une session de chat. Un user peut en avoir plusieurs.
-- Pour démarrer simple : 1 conversation "active" par user, on étendra plus tard.
CREATE TABLE conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) DEFAULT 'Nouvelle conversation',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Historique chronologique des échanges
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mémoire enrichie : faits long terme extraits automatiquement par Jarvis
-- Categories : preference, personal_fact, event, relationship, project, other
CREATE TABLE memories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fact TEXT NOT NULL,
  category VARCHAR(50) DEFAULT 'other',
  importance INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  shared BOOLEAN DEFAULT FALSE,  -- si TRUE, accessible aussi à l'autre user (couple)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes pour les requêtes fréquentes
CREATE INDEX idx_messages_conv_time ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_memories_user_importance ON memories(user_id, importance DESC);
CREATE INDEX idx_memories_shared ON memories(shared) WHERE shared = TRUE;
CREATE INDEX idx_conversations_user_updated ON conversations(user_id, updated_at DESC);

-- Vérification
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';