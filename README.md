# Phoenix Lead Finder

تطبيق ويب (PWA) يساعد الوكالات والمستقلين على **اكتشاف عملاء محتملين حقيقيين**، التحقق من هويتهم وحساباتهم الرسمية، تقييمهم، وتجهيز رسالة تعريفية **يرسلها الإنسان يدوياً**.

A web app (installable PWA) that helps agencies and freelancers **discover real business prospects**, verify their identity and official accounts, score them, and prepare an introduction message that **a human sends manually**.

> The app never sends messages by itself, never scrapes social networks, and never shows invented businesses. If an integration has no credentials it is shown as **CONFIGURATION REQUIRED**.

## What it does

1. You describe who you want (country, cities, industry, services, how many).
2. The server searches real sources: **OpenStreetMap** (free, no key), licensed **web-search APIs** (Tavily, Brave, Serper, You.com — optional keys), the businesses' **own websites**, and your **CSV / manual** lists.
3. Each business is de-duplicated and its identity checked: `VERIFIED`, `LIKELY` or `UNVERIFIED`. Every social link keeps the URL it was found on.
4. Optional AI (OpenAI, Gemini or Groq key) analyses the stored sources for opportunities — each one must quote its evidence — and the lead gets an explainable 100-point score.
5. You get a personalised message (AI or template), then open WhatsApp with the text prefilled, or copy-and-open Instagram / LinkedIn / Facebook, press Send yourself, and click **Mark as sent**.

Background discovery and daily/weekly schedules run on the server even when every device is switched off.

## Works with zero API keys

| Feature | No keys | With a web-search key | With an AI key |
|---|---|---|---|
| OpenStreetMap discovery, website reading, CSV import | yes | yes | yes |
| Dedupe, verification, rule-based score, templates, outreach, reports | yes | yes | yes |
| Instagram-profile and news discovery through search engines | CONFIGURATION REQUIRED | yes | — |
| AI analysis and AI-written messages | CONFIGURATION REQUIRED | — | yes |

## Quick start (local development)

Requirements: Node.js 22+, PostgreSQL 16.

```bash
cp .env.example .env
```

Edit `.env`: set `DATABASE_URL` to your local database and `ENCRYPTION_KEY` to the output of `openssl rand -hex 32`.

```bash
npm install
```

```bash
npm run db:migrate
```

```bash
npm run dev
```

In a second terminal start the background worker:

```bash
npm run worker
```

Open http://localhost:3000 — the first visit asks you to create the administrator.

## Documentation

| File | For |
|---|---|
| [docs/USER_GUIDE_AR.md](docs/USER_GUIDE_AR.md) | دليل المستخدم بالعربية |
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | Installing and the first-run setup |
| [docs/VPS_DEPLOYMENT.md](docs/VPS_DEPLOYMENT.md) | Deploying on an Ubuntu VPS with HTTPS, backups, updates (one command: `sudo bash deploy/install.sh your.domain`) |
| [docs/VERCEL_DEPLOYMENT_AR.md](docs/VERCEL_DEPLOYMENT_AR.md) | النشر على Vercel بدون خادم، وما يختلف فيه |
| [docs/SEARCH_PROVIDERS.md](docs/SEARCH_PROVIDERS.md) | Search sources and how to get the free keys |
| [docs/AI_CONFIGURATION.md](docs/AI_CONFIGURATION.md) | AI providers, limits, Sign in with ChatGPT status |
| [docs/SECURITY.md](docs/SECURITY.md) | Security model and operator checklist |
| [docs/TESTING.md](docs/TESTING.md) | Tests and what they cover |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the system is built |

## Honest status

See "Verified / not verified" in [docs/TESTING.md](docs/TESTING.md). In short: the application, database, authentication, job queue, de-duplication, verification, scoring, messaging and outreach flows are covered by automated tests and a real-browser check. Calls to the real external services (OpenStreetMap, search APIs, AI APIs) are implemented but must be confirmed on your own server with `npm run test:live` and the **Test connection** buttons.

OpenStreetMap data © OpenStreetMap contributors, available under the Open Database License (ODbL). The Cairo typeface is used under the SIL Open Font License 1.1.
