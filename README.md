Wall-E — Assistant vocal multi-utilisateurs

Assistant IA personnel avec mémoire vectorielle, persona modulaire, et synthèse vocale premium. 
Architecture cloud-native gratuite (0 €/mois).

[![Status](https://img.shields.io/badge/status-production-success)]()
[![License](https://img.shields.io/badge/license-private-blue)]()
[![Stack](https://img.shields.io/badge/stack-React%2019%20%7C%20Node%20ESM%20%7C%20PostgreSQL%20%2B%20pgvector-orange)]()

**Demo** : [jarvis-app-kohl-ten.vercel.app](https://jarvis-app-kohl-ten.vercel.app)
**Auteur** : Kat + un co-utilisateur : B

---

Caractéristiques principales

- Reconnaissance vocale serveur (Whisper Large v3 Turbo via Groq) — uniforme tous OS, ~500 ms de latence
- Mémoire persistante 4 niveaux : extraction auto (N0), explicite (N1), vectorielle sémantique (N2), auto-réflexion (N4)
- Persona modulaire** — switch Jarvis ↔ Wall-E via une variable d'env, prompts indépendants
- Synthèse vocale ElevenLabs — voix custom Wall-E (timbre robot enfantin) que j'ai créé + Web Audio API pour iOS Safari
- Recherche web sanitizée (Tavily) avec triple ligne de défense anti-injection
- Outils intégrés : `set_timer`, `set_alarm` via function calling, sonneries persistantes en localStorage
- Enrichissement RSS — 8 flux d'actualité injectés en contexte via cron horaire GitHub Actions
- Production-grade : Helmet, rate-limit 3 niveaux, sanitization, audit & quotas (200k tokens/user/jour)
- Multi-utilisateur : auth JWT, mémoires cloisonnées par profil + mémoires partagées
- UI spatial : fond étoilé, lune, avatar robot UNIT-01 Mecanum statique

---

Stack technique

| Couche | Technologie |
|--------|-------------|
| **Frontend** | React 19 · Vite 7 · Tailwind CSS v4 · lucide-react |
| **Backend** | Node.js 18+ ESM · Express · JWT · bcrypt · multer · helmet · express-rate-limit · Zod |
| **Base de données** | PostgreSQL (Neon, Frankfurt) + pgvector 0.8.0 (HNSW cosine) |
| **LLM principal** | GPT-OSS 120B via Groq (function calling, 3 outils) |
| **LLM léger** | Llama 3.1 8B Instant via Groq (extractions JSON) |
| **STT** | Whisper Large v3 Turbo via Groq |
| **Embeddings** | Mistral `mistral-embed` (1024 dims, plan Experiment) |
| **TTS** | ElevenLabs (voix custom Wall-E) + SpeechSynthesis fallback |
| **Recherche web** | Tavily AI (avec sanitization anti-injection) |
| **Hébergement front** | Vercel (Hobby) |
| **Hébergement back** | Render (Free) |
| **Hébergement DB** | Neon (Free) |
| **Cron** | GitHub Actions (workflow horaire pour refresh RSS) |

**Coût mensuel** : **0 €** sur tous les plans gratuits

---

## 🏗️ Architecture

```
┌─────────────────────┐         ┌──────────────────────┐
│  React 19 / Vite    │  HTTPS  │  Node ESM / Express  │
│  Vercel (Hobby)     │ ◄─────► │  Render (Free)       │
│  · MediaRecorder    │         │  · JWT + Zod         │
│  · Web Audio (iOS)  │         │  · Helmet + rate     │
│  · WalleAvatar      │         │  · Personas modular  │
└─────────────────────┘         └──────────┬───────────┘
                                           │
       ┌───────────────────────────────────┼──────────────────────────┐
       ▼                                   ▼                          ▼
┌──────────────┐              ┌────────────────────┐        ┌─────────────────┐
│  Neon DB     │              │  Groq API          │        │  Services       │
│  PostgreSQL  │              │  · GPT-OSS 120B    │        │  · Mistral      │
│  + pgvector  │              │  · Whisper v3      │        │  · ElevenLabs   │
│  HNSW cosine │              │  · Llama 3.1 8B    │        │  · Tavily       │
└──────────────┘              └────────────────────┘        └─────────────────┘
       ▲
       │
┌──────┴──────────┐
│ GitHub Actions  │
│ cron horaire    │
│ RSS refresh     │
└─────────────────┘
```

Persona

| Persona | Version | Caractère | Temperature |
|---------|---------|-----------|-------------|
| **Wall-E** *(actif)* | v3.1 | Chaleureux, simple, sincère, phrases courtes (6-12 mots) | 0.5 |
| 

---

Système de mémoire

| Niveau | Type | Trigger | Importance |
|--------|------|---------|------------|
| **N0** | Extraction automatique | Background à chaque tour (LLM léger) | 5 |
| **N1** | Explicite déclenchée | Détection patterns FR/EN ("souviens-toi que…") | 9 |
| **N2** | Vectorielle sémantique | Embedding Mistral + recherche cosine top-K=8 | — |
| **N4** | Auto-réflexion | Conv dormante (≥5 échanges, >30 min inactivité) | 8 |

Toutes les mémoires sont stockées dans une table unique avec champ `source` (`'auto'` / `'explicit'` / `'reflection'` / `'rss'`) et utilisent pgvector pour la recherche.

---

Démarrage rapide

Pré-requis
- Node.js 18+
- PostgreSQL (ou compte Neon gratuit)
- Clés API : Groq, Mistral, ElevenLabs, Tavily

Installation locale

```bash
# Cloner le repo
git clone https://github.com/xeliskatdata-ship-it/jarvis-app.git
cd jarvis-app

# Backend
cd server
npm install
cp ../.env.example ../.env  # remplir les clés API
node migrate.js              # exécuter les 6 migrations SQL
node seed.js                 # créer les utilisateurs
node server.js               # démarre sur :3001

# Frontend (dans un autre terminal)
cd ..
npm install
npm run dev                  # démarre sur :5173
```

### Variables d'environnement essentielles

```dotenv
DATABASE_URL=postgresql://...?uselibpqcompat=true
GROQ_API_KEY=gsk_...
MISTRAL_API_KEY=...
TAVILY_API_KEY=tvly-...
JWT_SECRET=<32+ chars>
RSS_REFRESH_SECRET=<openssl rand -hex 32>
ACTIVE_PERSONA=walle           # ou 'jarvis'
CORS_ORIGIN=http://localhost:5173
VITE_API_URL=http://localhost:3001
```

---

Structure du projet

```
jarvis-app/
├── public/
│   └── walle.png                  # Avatar UNIT-01 Mecanum
├── src/
│   ├── jarvis_interface.jsx       # Composant principal du chat
│   ├── WalleAvatar.jsx            # Avatar statique drop-in
│   └── ...
├── server/
│   ├── server.js                  # API Express (routes /chat, /transcribe, /admin/*)
│   ├── groq.js                    # Wrapper Groq (chat + chatWithTools)
│   ├── memory.js                  # Module N0/N1/N2
│   ├── reflect.js                 # Module N4 auto-réflexion
│   ├── tavily.js                  # Web search sanitizé
│   ├── rss.js                     # Module RSS context enricher
│   ├── whisper.js                 # STT Groq
│   ├── mistral.js                 # Embeddings Mistral
│   ├── usage.js                   # Audit & quotas
│   └── personas/
│       ├── _shared.js             # Directives communes
│       ├── jarvis.js              # Persona v14
│       ├── walle.js               # Persona v3.1
│       └── index.js               # Router (lit ACTIVE_PERSONA)
└── .github/
    └── workflows/
        └── rss-refresh.yml        # Cron horaire RSS
```

Roadmap

Court terme
- [ ] Dashboard admin UI (consomme `/admin/usage` + `/reflections`)
- [x] Web Notifications API (minuteurs/alarmes en arrière-plan)
- [ ] Palette ambre globale UI cohérente avec la persona Wall-E

Moyen terme
- [ ] **N3** : Consolidation périodique des mémoires (dédup vectoriel > 0.95)
- [ ] PWA polish mobile

Long terme
- [ ] Mode hors-ligne partiel (cache + queue)
- [ ] Multi-langue UI (i18n)

Sécurité

plusieurs couches créées.


Quotas

- **200 000 tokens/user/jour** (reset minuit UTC)
- **Alerte console** au-delà de 1M tokens/jour tous users confondus
- **Conversation moyenne** : ~3 200 tokens (chat 2500 + extract_facts 700) → ~60 conv/jour/user

Version

| Version | Date | Faits marquants |
|---------|------|-----------------|
| **v2.0** | 28 mai 2026 | Persona Wall-E v3.1 + UI spatiale + avatar UNIT-01 |
| 

Licence

Projet privé — usage personnel uniquement.
Inspiré du robot WALL-E (Pixar) pour la personnalité, sans reproduction de code/contenu du film.
