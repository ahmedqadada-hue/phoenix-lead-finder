# Security

## What the application does

| Area | Protection |
|---|---|
| Sign-in | Passwords hashed with bcrypt (cost 12). Sessions are random 256-bit tokens; only their SHA-256 hash is stored. Cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` when `APP_URL` is https. 30-day expiry; changing a password or deactivating a user ends their sessions. |
| Brute force | Login is rate-limited per e-mail + IP and per IP. The response does not reveal whether an e-mail exists. |
| Authorisation | Every page and every server action checks the session and role **on the server**. Employees can only read and change leads assigned to them. All queries are scoped to the user's organisation. Hidden buttons are never the only control. |
| Roles | ADMIN: integrations, users, everything. MANAGER: campaigns, assignment, outreach, reports. EMPLOYEE: assigned leads, messages, contact actions, statuses. |
| API keys | Encrypted with AES-256-GCM (`ENCRYPTION_KEY`), decrypted only on the server at call time, never returned to the browser, never logged. |
| SSRF | Every URL from search results, websites or users goes through one guarded fetcher: http/https only, no credentials, standard ports only, no internal host names, and the resolved IP is checked **at connection time** (blocks private, loopback, link-local, metadata and CGNAT ranges, and DNS rebinding). Redirects are re-validated. Responses are size- and time-limited. |
| Untrusted content | Web and social text is stored as data and sent to the AI inside a block marked untrusted. AI output is validated before it is saved. |
| Outbound links | Contact buttons open only canonical profile URLs on known platforms; website links must be http(s). All open with `rel="noopener noreferrer"`. |
| Input | Validated on the server with schemas. Database access uses parameterised queries. CSV export neutralises spreadsheet formulas. |
| Browser | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS, strict referrer policy, and no application data cached by the service worker. |
| Audit | Sign-ins, configuration changes, key changes, exports, deletions, status changes and "marked as sent" are written to the audit log (Settings, admin only). |
| Crawling | Identifies itself, respects `robots.txt`, reads at most the home page and one contact page of a business site, paced by the worker. |

## Outreach and privacy rules built in

- No automatic sending, no reading of replies, no social-media passwords, no logged-in automation.
- Opening a contact link is recorded as "contact opened" and is never counted as sent. Only **Mark as sent** does that.
- Do Not Contact registry: marked businesses are blocked from outreach and from being re-added by later searches.
- Data minimisation: only business-level public contact data is stored (business website, business phone/WhatsApp, business profiles). Personal LinkedIn profiles are ignored; e-mail addresses are not collected.
- Every stored social link and WhatsApp number keeps its source.

## Your checklist as the operator

1. Use a long random `POSTGRES_PASSWORD` and a unique `ENCRYPTION_KEY`; `chmod 600 .env`; never commit `.env`.
2. Keep a copy of `ENCRYPTION_KEY` and of the backups **off the server**.
3. Serve only over HTTPS (the provided Caddy setup does this) and set `APP_URL` to the https address.
4. Keep the server updated (`sudo apt update && sudo apt upgrade`) and allow only ports 22, 80, 443.
5. Give each person their own account with the lowest role that fits; deactivate accounts when people leave.
6. Set monthly limits on every paid provider, and a budget limit on the provider's own dashboard.
7. Check local law on unsolicited commercial messages in the countries you contact, and honour opt-outs through the Do Not Contact list.

## Known limits

- Login rate limiting is kept in the memory of the single web process; it resets on restart.
- If you set `PHOENIX_EGRESS_PROXY`, DNS is resolved by that proxy, so the proxy itself must not be able to reach your private network.
- Business logos are loaded by the browser directly from the business's https site.
- There is no two-factor authentication in this version.

## Reporting a problem

Disable the affected provider or user in the interface, take a backup, and review the audit log in Settings.
