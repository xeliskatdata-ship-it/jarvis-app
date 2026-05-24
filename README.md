# Jarvis

> Assistant vocal intelligent inspiré de l'IA d'Iron Man — interface web et mobile, mémoire persistante, recherche web, accès partagé en couple.

Application personnelle développée par Kat. Conversation vocale en français avec un assistant IA qui se souvient des échanges, comprend le contexte de chaque utilisateur, et peut consulter le web en temps réel pour répondre.

---

## Aperçu

Jarvis combine plusieurs briques modernes pour offrir une expérience d'assistant vocal proche de la fiction :

- **Reconnaissance vocale** dans le navigateur (Web Speech API)
- **Compréhension et génération** via Llama 4 Scout sur Groq
- **Synthèse vocale** via ElevenLabs (voix premium) ou navigateur natif (fallback)
- **Mémoire enrichie** stockée en base PostgreSQL — Jarvis se souvient de qui tu es, ce sur quoi tu travailles, et de tes recherches passées
- **Recherche web en temps réel** via Tavily AI quand l'info n'est pas dans ses connaissances
- **Multi-utilisateurs** avec mémoires partagées pour le contexte couple

---

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4 |
| Icônes | lucide-react |
| Backend | Node.js (ESM), Express, JWT (jsonwebtoken), bcrypt |
| Base de données | PostgreSQL (Neon, region Frankfurt) |
| LLM | Llama 4 Scout 17B via Groq API |
| Recherche web | Tavily AI |
| Reconnaissance vocale | Web Speech API (Chrome/Edge) |
| Synthèse vocale | ElevenLabs API + SpeechSynthesis (fallback) |
| Hébergement front | Vercel |
| Hébergement backend | Railway |
| Hébergement DB | Neon |

---

## Architecture

```mermaid
graph TB
    User[Utilisateur<br/>Kat ou Brice] --> Browser[Navigateur<br/>Chrome/Edge]
    Browser --> Front[Frontend React<br/>Vercel]

    Front -->|Web Speech API| STT[Transcription voix → texte]
    Front -->|JWT auth| API[Backend Express<br/>Railway]

    API --> DB[(PostgreSQL<br/>Neon)]
    API --> Groq[Llama 4 Scout<br/>via Groq]
    API --> Tavily[Tavily<br/>Web Search]

    Groq -.tool_call.-> Tavily
    Groq -->|texte| API
    API -->|réponse| Front

    Front -->|texte| TTS[ElevenLabs ou<br/>SpeechSynthesis]
    TTS --> Browser
```

---

## Fonctionnalités clés

Authentification — login email / password, JWT de 30 jours, multi-utilisateurs (Kat & Brice avec mémoires séparées + faits partagés).

Mémoire enrichie — 10 catégories de faits (personnel, projet, relation, préférence, habit, schedule, goal, opinion, emotional_state, event). Faits extraits automatiquement après chaque échange par un second appel LLM dédié.

Mémoires partagées en couple — un fait marqué `shared: true` est visible des deux côtés
Contexte temporel — date, jour, heure injectés automatiquement dans chaque échange.

Persona calibré — vouvoiement Stark, humour pince-sans-rire britannique, sobriété, prononciation forcée des prénoms problématiques (ex: "Kat" → "Kate" pour le TTS).

Function calling — Jarvis décide seul si une recherche web est nécessaire (uniquement actualité, météo, prix, faits récents).

Interface — orb HUD animé en SVG, taille responsive, trois états (idle / listening / speaking) synchronisés avec l'état réel de l'audio.

---

## Structure du projet

```
jarvis-app/
├── src/                          # Frontend React
│   ├── App.jsx                   # Router login/chat
│   ├── LoginScreen.jsx           # Écran de connexion
│   ├── jarvis_interface.jsx      # Interface principale (orb + chat + micro)
│   └── index.css                 # Tailwind import
├── server/                       # Backend Node
│   ├── server.js                 # API Express + routes + tool definitions
│   ├── db.js                     # Pool Postgres + helpers
│   ├── groq.js                   # Service LLM + function calling
│   ├── memory.js                 # Extraction & retrieval mémoires
│   ├── tavily.js                 # Service recherche web
│   ├── seed.js                   # Script de création users initial
│   └── package.json
├── db/
│   ├── schema.sql                # Schéma DB (users, conversations, messages, memories)
│   └── seed_memories.sql         # Faits initiaux pré-chargés
├── public/
├── .env                          # Variables d'environnement (NOT COMMITTED)
├── .gitignore
├── index.html
├── package.json                  # Deps frontend
├── vite.config.js
└── README.md
```

---

## Installation locale

### Prérequis

- Node.js 22+ (LTS)
- Un compte [Neon](https://console.neon.tech) pour la DB
- Un compte [Groq](https://console.groq.com) pour le LLM
- Un compte [Tavily](https://app.tavily.com) pour la recherche web
- Optionnel : compte [ElevenLabs](https://elevenlabs.io) pour la voix premium

### 1. Cloner et installer

```bash
git clone <ton-repo-github>
cd jarvis-app

# Dépendances frontend
npm install

# Dépendances backend
cd server
npm install
cd ..
```

### 2. Configurer la base de données

Dans Neon SQL Editor, exécuter dans l'ordre :
- `db/schema.sql` (création des tables)
- `db/seed_memories.sql` (faits initiaux — à éditer selon ton usage)

### 3. Variables d'environnement

Créer un fichier `.env` à la racine du projet :

```env
# Postgres Neon
DATABASE_URL="postgresql://user:pass@xxx.neon.tech/neondb?sslmode=require"

# Groq (LLM)
GROQ_API_KEY=gsk_...

# Tavily (recherche web)
TAVILY_API_KEY=tvly_...

# JWT - générer une string aléatoire de 32+ caractères
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=...

# Frontend - URL du backend
VITE_API_URL=http://localhost:3xxxx

# CORS (optionnel en local)
CORS_ORIGIN=http://localhost:5xxx
```

### 4. Créer les utilisateurs

```bash
cd server
npm run seed
```

Répondre aux prompts pour créer Kat et Brice (email + mot de passe).

### 5. Lancer en mode développement

Dans deux terminaux séparés :

```bash
# Terminal 1 — Backend
cd server
npm run dev

# Terminal 2 — Frontend
npm run dev
```

Ouvrir `http://localhost:xxxxx` dans Chrome ou Edge (Firefox ne supporte pas Web Speech API).

---

## Schéma de la base de données

```mermaid
erDiagram
    users ||--o{ conversations : has
    users ||--o{ memories : owns
    conversations ||--o{ messages : contains

    users {
        int id PK
        string email UK
        string name
        string password_hash
        timestamp created_at
    }
    conversations {
        int id PK
        int user_id FK
        string title
        timestamp created_at
        timestamp updated_at
    }
    messages {
        int id PK
        int conversation_id FK
        string role
        text content
        timestamp created_at
    }
    memories {
        int id PK
        int user_id FK
        text fact
        string category
        int importance
        bool shared
        timestamp created_at
        timestamp last_used_at
    }
```

---

## Catégories de mémoire

| Catégorie | Usage |
|---|---|
| `personal_fact` | Identité, métier, lieu de vie |
| `relationship` | Relations, proches, partenaire |
| `project` | Projets pro ou perso en cours |
| `preference` | Goûts, choix techniques, marques |
| `habit` | Routines quotidiennes |
| `schedule` | Rythme de vie, horaires |
| `goal` | Objectifs court/moyen/long terme |
| `opinion` | Positions sur des sujets |
| `emotional_state` | Humeur, fatigue, stress (utilisé avec parcimonie) |
| `event` | Événements futurs avec date |
| `web_research` | Trace des recherches web faites par Jarvis |
| `other` | Tout le reste pertinent |

---

## Déploiement

- **Frontend** : Vercel (déploiement automatique au push sur `main`)
- **Backend** : Railway (déploiement automatique au push sur `main`)
- **DB** : Neon (déjà cloud)

Variables d'environnement à configurer côté plateforme d'hébergement (à venir).

---

Inspiré de l'IA Jarvis de Tony Stark dans Iron Man (Marvel Studios). Personnage et univers sont la propriété de leurs ayants droit ; ce projet est un usage personnel sans utilisation d'éléments visuels ou textuels copyrightés.

Projet privé — usage personnel