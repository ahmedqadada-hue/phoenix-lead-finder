# Testing

## Run the tests

The automated suite needs a PostgreSQL database dedicated to tests (default: `postgresql://phoenix:phoenix@localhost:5432/phoenix_test`; override with `TEST_DATABASE_URL`). It is wiped by the tests, so never point it at real data.

```bash
npm test
```

Type check and production build:

```bash
npm run typecheck
```

```bash
npm run build
```

Live checks against the real services (needs normal internet access; OpenStreetMap needs no key, other providers run only if you export `TAVILY_API_KEY`, `BRAVE_API_KEY`, `SERPER_API_KEY`, `YOUCOM_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` or `GROQ_API_KEY` in your shell):

```bash
npm run test:live
```

## What is covered

| Requirement | Test file |
|---|---|
| Search query generation | `tests/discovery-pure.test.ts` |
| Lead normalisation (names, domains, phones) | `tests/discovery-pure.test.ts` |
| Duplicate detection, including "do not merge unrelated businesses" | `tests/discovery-pure.test.ts`, `tests/workflow.db.test.ts` |
| Profile / identity verification | `tests/discovery-pure.test.ts`, `tests/workflow.db.test.ts` |
| Website reading, robots.txt, source tracking | `tests/discovery-pure.test.ts` |
| Provider adapters (request shape, mapping, error classes) | `tests/providers.test.ts` (mocked HTTP) |
| Real provider integration | `tests/live/providers.live.test.ts` |
| Lead scoring | `tests/logic.test.ts` |
| Message generation and validation | `tests/logic.test.ts`, `tests/workflow.db.test.ts` |
| AI output validation (drops invented sources) | `tests/logic.test.ts`, `tests/workflow.db.test.ts` |
| WhatsApp link generation | `tests/logic.test.ts`, `tests/workflow.db.test.ts` |
| Clipboard actions and fallbacks | `tests/logic.test.ts` |
| Lead status management ("opened" is never "sent") | `tests/logic.test.ts`, `tests/workflow.db.test.ts` |
| Authentication helpers, roles, organisation isolation | `tests/logic.test.ts`, `tests/workflow.db.test.ts` |
| Background jobs (claiming, retries, backoff, pause, crash recovery, schedules, quota) | `tests/workflow.db.test.ts` |
| Database operations with real migrations | `tests/workflow.db.test.ts` |
| Security helpers (encryption, SSRF guard, rate limit, CSV) | `tests/logic.test.ts` |

The full workflow test runs, against a real PostgreSQL database:

Create campaign → search → de-duplicate → verify identity → find official profiles → AI analysis → score → generate message → open contact → mark as sent.

## Fixtures

Tests replace external services with **clearly labelled fixtures**: names beginning with `FIXTURE` and reserved `.example` domains. They exist only inside the test database. The application itself contains no sample or demo businesses, and an empty database shows empty states.

## Verified / not verified in the build environment

Results recorded when this version was built (November 2026):

| Item | Result |
|---|---|
| `npm test` | 88 tests passed in 4 files |
| `npm run typecheck`, `npm run build` | passed |
| Real-browser check (Chromium): first-run setup, sign-in/out, add lead, worker scoring, template message, WhatsApp prefill, Instagram copy-and-open, "contact opened" vs "mark as sent", all 14 sections, mobile layout, English switch | passed, no console errors |
| `docker compose config` | valid |
| **Docker image build** | **not verified** — the build environment gives build containers no network, so `npm ci` inside the image could not download packages. The same steps (`npm ci`, `prisma generate`, `next build`) pass outside Docker. Verify with `docker compose up -d --build` on your server. |
| **Live OpenStreetMap search** | **not verified** — every Overpass server was unreachable from the build environment's network. Run `npm run test:live` and press **Test connection** on your server. |
| **Live Tavily / Brave / Serper / You.com** | **not verified** — no API keys were available. Status in the app: CONFIGURATION REQUIRED. |
| **Live OpenAI / Gemini / Groq** | **not verified** — no API keys were available. Status in the app: CONFIGURATION REQUIRED. |
| Serverless mode (no worker process): cron endpoint authorisation and jobs processed from the open app | passed locally with `SERVERLESS_WORKER=1` |
| **Deployment on Vercel** | **not performed** — follow `VERCEL_DEPLOYMENT_AR.md` and verify step 6. |
| Deployment on a VPS, real HTTPS certificate | **not performed** — follow `VPS_DEPLOYMENT.md` and verify step 8. |
| PWA install prompt on physical phones | not tested on devices; the manifest, icons and service worker are served and valid. |
