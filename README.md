# Jarvis — Assistant vocal multi-utilisateurs

> *"Avec une clarté presque inquiétante."*

Assistant vocal personnel inspiré de l'IA de Tony Stark, conçu pour un usage privé en couple. Reconnaissance vocale serveur, LLM Llama 4 Scout, mémoire persistante multi-utilisateurs, recherche web temps réel, synthèse vocale ElevenLabs, minuteurs/alarmes, humour noir réglé.

**Production :** [https://jarvis-app-kohl-ten.vercel.app](https://jarvis-app-kohl-ten.vercel.app)

---

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  Frontend       │◄────────┤  Backend         │────────►│  PostgreSQL     │
│  React + Vite   │  HTTPS  │  Node + Express  │  TLS    │  Neon Frankfurt │
│  Vercel         │         │  Render          │         │                 │
└────────┬────────┘         └────┬─────────────┘         └─────────────────┘
         │                       │
         │ ElevenLabs TTS        │ Groq (LLM + Whisper)
         │ (côté client)         │ Tavily (web search)
         ▼                       ▼
```

Le frontend appelle directement ElevenLabs pour minimiser la latence TTS. Le backend orchestre les appels Groq (Llama 4 Scout + Whisper) et Tavily, et persiste tout en base.

---

## Stack technique

| Couche | Techno |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS v4, lucide-react |
| Backend | Node.js (ESM, ≥ 18), Express, JWT, bcrypt, multer |
| DB | PostgreSQL via Neon (Frankfurt) |
| LLM | Llama 4 Scout 17B via Groq (function calling) |
| STT | Whisper Large v3 Turbo via Groq |
| Web search | Tavily AI |
| TTS | ElevenLabs (voix George) + SpeechSynthesis fallback |
| Hosting | Vercel (front) + Render Free (back) + Neon Free (DB) |

**Coût total : 0 €/mois** dans les limites des plans gratuits.

---

## Fonctionnalités

### Conversation
- Authentification JWT multi-utilisateurs (Kat + Brice)
- Historique persistant en DB par conversation
- Persona Jarvis Stark v7.1 : pince-sans-rire britannique, humour noir bienvenu avec garde-fous
- Tutoiement naturel, prononciation forcée pour les prénoms problématiques
- Mémoire enrichie : extraction automatique de faits classés en 10 catégories, mémoires partagées Kat/Brice
- Contexte temporel injecté à chaque tour (date + heure Paris)

### Voix
- STT serveur via Groq Whisper Large v3 Turbo (uniforme tous OS/navigateurs, supérieur à Web Speech API)
- TTS premium ElevenLabs ou fallback navigateur si pas de clé API
- Compatibilité iPhone Safari validée via Web Audio API (decodeAudioData + BufferSource)
- Capture audio via MediaRecorder, détection auto du mime (webm/ogg/mp4)

### Outils (function calling)
- `web_search` : recherche web temps réel via Tavily (météo, actu, prix, sport)
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
- Compte PostgreSQL (Neon recommandé)
- Clés API : Groq, Tavily, ElevenLabs (optionnel)

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

### Variables d'environnement

Créer un `.env` à la racine du projet :

```env
DATABASE_URL=postgres://...neon.tech/jarvis
GROQ_API_KEY=gsk_...
TAVILY_API_KEY=tvly-...
JWT_SECRET=at_least_32_chars_random_string
CORS_ORIGIN=http://localhost:xxxx
VITE_API_URL=http://localhost:xxxx
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
| Frontend → **Vercel** | Auto-deploy sur push `main`. Root directory = `.`, build = `npm run build`, output = `dist` |
| Backend → **Render** | Auto-deploy sur push `main` (à activer dans Settings → Build & Deploy). Root = `server/`, build = `npm install`, start = `npm start` |
| DB → **Neon** | Provisionnée une fois, connection pooling activé |

---

## Structure du repo

```
jarvis-app/
├── src/
│   ├── jarvis_interface.jsx       # Composant principal UI + audio + capture
│   ├── login.jsx                  # Écran de connexion
│   └── main.jsx
├── server/
│   ├── server.js                  # Routes Express, auth, /chat, /transcribe
│   ├── groq.js                    # Wrapper Groq + function calling
│   ├── whisper.js                 # STT via Groq Whisper
│   ├── tavily.js                  # Wrapper Tavily web search
│   ├── memory.js                  # Extraction de faits + récupération mémoires
│   ├── db.js                      # Pool PostgreSQL
│   ├── seed.js                    # Création des utilisateurs initiaux
│   └── package.json
└── README.md
```

---

## Roadmap

### Court terme
- Activation de l'auto-deploy Render sur push `main`
- Web Notifications API pour les minuteurs en arrière-plan (~15 min)

### Moyen terme
- Mémoire vectorielle (embeddings sémantiques) pour récupération intelligente — gros saut qualitatif (~3h)
- Mémoire explicite : détection de *"souviens-toi que…"* (~30 min)

### Long terme
- Intégration Spotify (OAuth, contrôle de lecture) — ~3-4h, nécessite Premium
- Consolidation périodique des mémoires (cron) (~2h)
- Auto-réflexion : Jarvis génère ses propres "leçons retenues" (~2h)

---

Projet privé, usage personnel non commercial.
