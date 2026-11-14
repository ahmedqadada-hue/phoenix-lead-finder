# Search providers

Phoenix Lead Finder finds businesses through a small set of interchangeable sources. Enable any combination on the **Search Providers** page. Nothing is hard-wired: if a provider changes its pricing, switch it off and enable another, with no code change.

## What each source is good for

| Source | Key needed | Finds | Does not find |
|---|---|---|---|
| **OpenStreetMap** | No | Real restaurants, shops, clinics, etc. in a city that list a website, phone or social account | News; businesses not on the open map |
| **Business website reader** | No | The official Instagram / Facebook / LinkedIn / TikTok / YouTube / WhatsApp links a business publishes on its own site | Anything not linked from the site |
| **CSV import / manual entry** | No | Whatever list you already have | — |
| **Tavily, Brave, Serper, You.com** | Yes | Public Instagram / Facebook / LinkedIn / TikTok business profiles indexed by search engines, official websites, announcements ("opening soon", "new branch") | Private accounts; anything search engines have not indexed |

**Instagram discovery** works through search engines (queries such as `site:instagram.com "مطعم" "الرياض"`), so it needs at least one web-search key. The app never logs in to Instagram or LinkedIn, never scrapes them and never bypasses their limits. Instagram's official API cannot search accounts by keyword.

## Getting keys (free allowances)

Free allowances change often. The figures below were collected from public sources in November 2026 and **must be checked on each provider's own pricing page** before you rely on them.

| Provider | Sign-up | Reported free allowance | Card required |
|---|---|---|---|
| Tavily | https://app.tavily.com/ | about 1,000 credits per month | reported: no |
| You.com | https://you.com/platform | about 100 calls per day | not confirmed |
| Brave Search | https://api-dashboard.search.brave.com/ | $5 credit per month (about 1,000 searches) | yes, and no spending cap on their side |
| Serper | https://serper.dev/ | 2,500 searches, one time | reported: no |

Steps for any of them:

1. Create an account on the provider's site and create an **API key**.
2. In Phoenix: **Search Providers** → the provider's card → paste the key → **Save**.
3. Press **Test connection**. The badge turns to "Working" only if a real call succeeds.
4. Set the **Monthly limit** below your free allowance. The app stops using the provider when the limit is reached, so it cannot run up a bill past the number you chose.

Never paste keys into chats, e-mails or code. They belong only in that form.

## How the app protects your allowance

- **Monthly limit per provider**, enforced atomically in the database.
- **Rotation**: with several web providers enabled, each query goes to the one with the most allowance left.
- **Query cache**: an identical web query is not executed again within 6 days; an OpenStreetMap city/industry lookup not within 20 hours. Skipped queries appear in the job log as "run recently".
- **Query budget**: a campaign uses between 6 and 40 web queries depending on the requested count.
- **No endless retries**: a temporary failure is retried at most 3 times with increasing delays; an invalid key is not retried and the provider is flagged.

## OpenStreetMap notes

- Data © OpenStreetMap contributors, Open Database License (ODbL). Storing it is permitted; keep the attribution shown in the app.
- The public Overpass servers are a shared free service. Set `CRAWLER_CONTACT` in `.env` so the administrators can reach you, and keep campaigns reasonable.
- If the default server is slow or unreachable from your host, set `OVERPASS_URL` in `.env` to another public Overpass endpoint (for example `https://overpass.private.coffee/api/interpreter`) and restart.
- Coverage varies by city. Supported industries are those in the campaign form; a free-text "other" industry is searched on the web only.

## Deliberately not supported

- Scraping Instagram, LinkedIn, Facebook or TikTok directly, logged-in automation, CAPTCHA or rate-limit bypass.
- Google Maps / Places data storage (its licence restricts storing results).
- Google Custom Search JSON API (closed to new customers in 2026, retiring in 2027).
- Meta Content Library (research access, not a prospecting API).

## Status wording

| Badge | Meaning |
|---|---|
| Working | The last real connection test or search succeeded |
| Not tested | Saved but never tested |
| CONFIGURATION REQUIRED | No key saved; the provider is not used |
| Invalid key | The provider rejected the key; it is not used until you fix it |
| Quota exhausted | The provider reported that your allowance is used up |

You.com is marked **experimental**: its adapter follows the published API shape but was not confirmed against the live service in this release. Use **Test connection** before relying on it.
