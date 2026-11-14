# Architecture

One repository, one Docker image, no microservices.

```
Browser / installed PWA  ──HTTPS──>  Caddy (TLS)  ──>  web  (Next.js: pages + server actions)
                                                         │
                                                         ▼
                                                    PostgreSQL  <──  worker (background jobs)
                                                                        │
                                                                        ▼
                                             OpenStreetMap · search APIs · business websites · AI APIs
```

- **web** — Next.js 15 (App Router, React 19, TypeScript, Tailwind). Pages are rendered on the server and read the database directly with Prisma. Every change goes through a *server action* that checks the session and the role on the server.
- **worker** — a small Node process (`worker/index.ts`). It claims jobs from PostgreSQL, runs them, starts scheduled campaigns and recovers jobs left by a crash. It needs no browser.
- **PostgreSQL** — the single source of truth for every device. It is also the job queue (no Redis).
- **Caddy** — reverse proxy with automatic HTTPS certificates.

## Folders

| Path | Contents |
|---|---|
| `prisma/` | Database schema and migrations |
| `src/app/` | Pages (`(app)/…`), login, first-run setup, offline page, manifest, CSV export, health check |
| `src/actions/` | Server actions (the only way data is changed), each with authorisation |
| `src/lib/discovery/` | Query generation, normalisation, social-URL parsing, de-duplication, verification, website reader, the engine |
| `src/lib/providers/search/` | Search provider adapters: `osm`, `tavily`, `brave`, `serper`, `youcom` |
| `src/lib/providers/ai/` | AI provider adapter (OpenAI-compatible) and analysis validation |
| `src/lib/` | Scoring, messages, outreach links, jobs, crypto, SSRF guard, auth, CSV |
| `worker/` | Background worker entry point |
| `tests/` | Automated tests (`tests/live/` call the real services) |
| `deploy/` | Caddyfile, backup and restore scripts |

## Discovery pipeline

1. **Start run** (`startCampaignRun`) — creates `SEARCH` jobs: one per city for OpenStreetMap, one per generated web query. If no provider is usable the campaign fails with `NO_PROVIDER_AVAILABLE` and nothing is invented.
2. **SEARCH job** — picks a usable provider (web providers rotate by remaining allowance), checks the query cache (an identical web query is not paid for twice within 6 days), takes one unit of the monthly allowance atomically, calls the provider, converts each hit to a candidate, and ingests it.
3. **Ingestion** (`ingestCandidate`) — inside one transaction with a per-organisation lock: Do Not Contact check, duplicate check (same website domain, same social handle, or same normalised name **and** city without conflicting identifiers), then merge or create.
4. **ENRICH job** — reads the business's own website (robots.txt respected, SSRF-guarded), extracts official social links, WhatsApp and phone with the page as their source, re-checks duplicates, computes the verification status, adds keyword opportunity hints (always marked uncertain), scores the lead.
5. **ANALYZE job** (only when an AI provider is usable) — sends the stored sources to the model as untrusted data, validates the answer (an opportunity citing a URL that was not supplied is dropped; a quote that is not in the source is downgraded to uncertain), stores the analysis and re-scores.

Jobs retry temporary failures with exponential backoff, at most 3 attempts. Invalid keys are not retried and the provider is flagged.

## Adding a provider

- **Search**: implement `SearchProvider` (`src/lib/providers/search/types.ts`) and add it to `registry.ts`. It appears on the Search Providers page automatically.
- **AI**: add one `openAICompatible({...})` entry in `src/lib/providers/ai/registry.ts`, or implement `AIProvider` for a non-compatible API.

## Data model (main tables)

`Organization`, `User`, `Session`, `Campaign`, `Lead`, `LeadSocialAccount`, `DiscoverySource`, `OpportunitySignal`, `AIAnalysis`, `LeadScore`, `GeneratedMessage`, `OutreachActivity`, `FollowUpTask`, `ProviderConnection`, `BackgroundJob`, `QueryLog`, `MessageTemplate`, `DoNotContact`, `AuditLog`.

## PWA

`/manifest.webmanifest` (standalone display, icons, Arabic RTL), `public/sw.js` (install + safe offline page only). Application data is never cached in the browser, so every device always sees the server's current data and updates arrive automatically on the next load. The app is **not** usable offline, by design.
