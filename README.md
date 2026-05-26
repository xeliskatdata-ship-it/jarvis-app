# Jarvis — Assistant vocal multi-utilisateurs

> *"Avec une clarté presque inquiétante."*

Assistant vocal personnel inspiré de l'IA de Tony Stark, conçu pour un usage privé en couple. Reconnaissance vocale serveur, LLM GPT-OSS 120B, mémoire persistante avec recherche vectorielle, enrichissement RSS continu, audit & quotas, auto-réflexion comportementale, recherche web temps réel, synthèse vocale ElevenLabs, minuteurs/alarmes, humour noir réglé.


---

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  Frontend       │◄────────┤  Backend         │────────►│  PostgreSQL     │
│  React + Vite   │  HTTPS  │  Node + Express  │  TLS    │  Neon Frankfurt │
│  Vercel         │         │  Render          │         │  + pgvector     │
└────────┬────────┘         └────┬─────────────┘         └─────────────────┘
         │                       │
         │ ElevenLabs TTS        │ Groq (GPT-OSS 120B + Whisper)
         │ (côté client)         │ Mistral (embeddings 1024 dims)
         │                       │ Tavily (web search sanitized)
         ▼                       ▼
                                 ▲
                                 │ Cron horaire
                          ┌──────┴────────┐
                          │ GitHub Actions│
                          │ RSS Refresh   │
                          └───────────────┘
```

Le frontend appelle directement ElevenLabs pour minimiser la latence TTS. Le backend orchestre Groq (LLM + Whisper), Mistral (embeddings), Tavily (web search sanitized contre prompt injection), persiste tout en base PostgreSQL avec pgvector pour la recherche sémantique. Un cron GitHub Actions hit l'endpoint RSS toutes les heures pour enrichir la mémoire avec les actualités.

---

## Stack technique

| Couche | Techno |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS v4, lucide-react |
| Backend | Node.js (ESM, ≥ 18), Express, JWT, bcrypt, multer, helmet, express-rate-limit, zod |
| DB | PostgreSQL via Neon (Frankfurt) + extension pgvector 0.8.0 (HNSW cosine) |
| LLM principal | GPT-OSS 120B via Groq (function calling) |
| LLM léger | Llama 3.1 8B Instant via Groq (extractions JSON) |
| STT | Whisper Large v3 Turbo via Groq |
| Embeddings | Mistral mistral-embed (1024 dimensions) |
| Web search | Tavily AI (avec sanitization anti-injection) |
| TTS | ElevenLabs (voix George) + SpeechSynthesis fallback |
| Cron | GitHub Actions (refresh RSS horaire) |
| Hosting | Vercel (front) + Render Free (back) + Neon Free (DB) |

**Coût total : 0 €/mois** dans les limites des plans gratuits.

---

## Fonctionnalités

### Conversation
- Authentification JWT multi-utilisateurs 
- Historique persistant en DB par conversation
- Persona Jarvis Stark v7.1 : pince-sans-rire britannique, humour noir bienvenu avec garde-fous
- Tutoiement naturel, prononciation forcée pour les prénoms problématiques
- Contexte temporel injecté à chaque tour (date + heure Paris)

### Mémoire enrichie (4 niveaux)
- **N0** : extraction automatique de faits en arrière-plan (10 catégories : `personal_fact`, `relationship`, `project`, `preference`, `habit`, `schedule`, `goal`, `opinion`, `emotional_state`, `event`, `other`)
- **N1** : mémoire explicite déclenchée par regex FR/EN (*"souviens-toi que…"*, *"n'oublie pas…"*, *"remember that…"*) → importance maximale
- **N2** : recherche vectorielle top-K=8 par similarité cosine via embeddings Mistral 1024 dims + index pgvector HNSW
- **N4** : auto-réflexion sur conversations dormantes (≥ 5 échanges, > 30 min inactif) → génération de 2 patterns comportementaux max, dédup vectoriel cosine 0.85
- Mémoires partagées Kat / Brice (champ `shared`)

### Sécurité (3 couches)

### Enrichissement continu (RSS)
- 8 flux RSS automatiques : Le Monde, France Info, Le Big Data, ZDNet France, Frandroid, CERT-FR/ANSSI, AlloCiné News Ciné, Futura High-Tech
- Endpoint `POST /rss/refresh` protégé par secret `X-Refresh-Secret`
- Cron GitHub Actions horaire (`.github/workflows/rss-refresh.yml`)
- Articles embeddés via Mistral et stockés avec `source='rss'`, `category='news'`, `shared=true` (Kat et Brice y ont accès)
- Auto-désactivation des flux qui plantent, cleanup articles > 30 jours

### Voix
- STT serveur via Groq Whisper Large v3 Turbo (uniforme tous OS, prompt vocabulaire correctif pour noms propres : Jarvis, Kat, Brice, etc.)
- TTS premium ElevenLabs ou fallback navigateur si pas de clé API
- Compatibilité iPhone Safari validée via Web Audio API (`decodeAudioData` + `BufferSource`)
- Capture audio via MediaRecorder, détection auto du mime (webm/ogg/mp4)

### Outils (function calling)
- `web_search` : recherche web temps réel via Tavily sanitized
- `set_timer` : minuteurs côté navigateur, persistés en localStorage, sonnerie continue jusqu'au dismiss
- `set_alarm` : alarmes à heure absolue, idem persistance et sonnerie continue

### UI
- Orbe Jarvis SVG animé qui change d'état (idle / listening / processing / speaking)
- Pills flottantes pour les minuteurs/alarmes actifs avec countdown live
- Banner de notification pulsant + bouton dédié "Arrêter la sonnerie"
- Modal Settings (clé ElevenLabs, voice ID, déconnexion)

---

## Setup local

### Pré-requis
- Node.js ≥ 18
- Git
- Compte PostgreSQL avec pgvector (Neon recommandé)
- Clés API : Groq, Mistral, Tavily (web search), ElevenLabs (TTS, optionnel)

### Installation

```bash
git clone https://github.com/xeliskatdata-ship-it/jarvis-app.git
cd jarvis-app

# Frontend
npm install

# Backend
cd server
npm install
```

### Migrations DB

Appliquer dans l'ordre via Neon SQL Editor (ou autre client psql) :

```
migrations/
├── 001_memories_source.sql          # Colonne source (auto / explicit / reflection / rss)
├── 002_memories_embedding.sql       # Extension pgvector + colonne embedding vector(1024) + index HNSW
├── 003_rss_tables.sql                # Tables rss_feeds + rss_articles
├── 004_rss_feeds_update.sql          # Seed des 8 flux RSS actifs
├── 005_usage_logs.sql                # Table usage_logs pour audit & quotas
└── 006_reflection.sql                # Colonne reflected_at sur conversations
```

### Backfill embeddings (une fois si mémoires existantes)

Pour calculer les embeddings sur les mémoires créées avant la migration #2 :

```bash
cd server
node scripts/backfill_embeddings.js
```

### Variables d'environnement

Créer un `.env` à la racine du projet (sans guillemets autour de la valeur) :

```env
DATABASE_URL=postgres://...
GROQ_API_KEY=gsk_...
MISTRAL_API_KEY=...
TAVILY_API_KEY=tvly-...
JWT_SECRET=at_least_32_chars_random_string
RSS_REFRESH_SECRET=64_chars_hex_via_openssl_rand_hex_32
CORS_ORIGIN=http://localhost:xxxx
VITE_API_URL=http://localhost:xxxx
```

Pour générer le `RSS_REFRESH_SECRET` :
```bash
openssl rand -hex 32
```

### Lancer

```bash
# Backend (port 3001)
cd server
npm start

# Frontend (port 5173)
npm run dev
```

### Seed des utilisateurs

```bash
cd server
node seed.js
```

---

## Déploiement

| Service | Configuration |
|---|---|
| Frontend → **Vercel** | Auto-deploy sur push `main`. Root = `.`, build = `npm run build`, output = `dist` |
| Backend → **Render** | Auto-deploy sur push `main`. Root = `server/`, build = `npm install`, start = `npm start` |
| DB → **Neon** | Provisionnée une fois, pgvector activé via migration 002 |
| Cron RSS → **GitHub Actions** | Trigger `cron: '0 * * * *'` (horaire UTC). Secret `RSS_REFRESH_SECRET` configuré dans GitHub Settings → Secrets → Actions |

**Render et Vercel** nécessitent les mêmes variables d'environnement qu'en local. Pour Render, secret `RSS_REFRESH_SECRET` également (même valeur partout).

---

## Endpoints API

### Auth
- `POST /auth/login` — Login email/password → JWT (validation Zod, rate-limit 10/15min)

### Conversation
- `POST /chat` — Envoie un message à Jarvis (validation Zod, check quota, rate-limit 30/15min user, trigger N4 en background)
- `POST /transcribe` — Upload audio multipart → texte (rate-limit user)
- `GET /history` — Historique de la conversation courante
- `GET /memories` — Toutes les mémoires accessibles (perso + partagées)

### Audit & quotas
- `GET /usage/me` — Quota personnel du jour (`used`, `limit`, `remaining`, `exceeded`)
- `GET /admin/usage` — Dashboard JSON complet (admin seulement, IDs 1 et 2)

### Auto-réflexion
- `GET /reflections` — Liste des patterns comportementaux de l'user
- `POST /reflect/now` — Force une réflexion immédiate sur la conv dormante (admin)

### RSS
- `POST /rss/refresh` — Refresh des 8 flux RSS (protégé par `X-Refresh-Secret`, appelé par cron)

### Health
- `GET /health` — Healthcheck simple

---

## Structure du repo

```
jarvis-app/
├── src/
│   ├── jarvis_interface.jsx       # Composant principal UI + audio + capture
│   ├── login.jsx                  # Écran de connexion
│   └── main.jsx
├── server/
│   ├── server.js                  # Routes Express, auth, /chat, /transcribe, /admin, /reflections, /rss
│   ├── groq.js                    # Wrapper Groq + function calling + tracking usage
│   ├── whisper.js                 # STT via Groq Whisper + vocab prompt
│   ├── tavily.js                  # Wrapper Tavily web search + sanitization anti-injection
│   ├── memory.js                  # Extraction N0/N1 + recherche N2 vectorielle
│   ├── mistral.js                 # Helper embeddings batch + toPgVector
│   ├── rss.js                     # Refresh flux RSS, parse, embed, insert
│   ├── reflect.js                 # N4 auto-réflexion avec dédup vectoriel
│   ├── usage.js                   # logUsage + checkQuota + getAdminStats
│   ├── db.js                      # Pool PostgreSQL
│   ├── seed.js                    # Création des utilisateurs initiaux
│   ├── scripts/
│   │   ├── backfill_embeddings.js # One-shot embeddings sur mémoires existantes
│   │   └── refresh_rss.js         # Script CLI pour refresh RSS manuel
│   └── package.json
├── migrations/
│   ├── 001_memories_source.sql
│   ├── 002_memories_embedding.sql
│   ├── 003_rss_tables.sql
│   ├── 004_rss_feeds_update.sql
│   ├── 005_usage_logs.sql
│   └── 006_reflection.sql
├── .github/
│   └── workflows/
│       └── rss-refresh.yml        # Cron horaire pour refresh RSS
└── README.md
```


Projet privé, usage personnel non commercial.
