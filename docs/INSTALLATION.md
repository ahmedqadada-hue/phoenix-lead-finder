# Installation

There are two ways to run Phoenix Lead Finder.

| You want to… | Use |
|---|---|
| Put it online for your team | [VPS_DEPLOYMENT.md](VPS_DEPLOYMENT.md) (Docker, recommended) |
| Try it on your own computer | "Local run" below |

## Local run

You need Node.js 22 or newer and PostgreSQL 16.

1. Create a database and a user in PostgreSQL (example names: database `phoenix`, user `phoenix`).
2. Copy the settings file:

```bash
cp .env.example .env
```

3. Open `.env` and set:
   - `DATABASE_URL` — for a local database: `postgresql://phoenix:YOUR_PASSWORD@localhost:5432/phoenix`
   - `ENCRYPTION_KEY` — run the next command and paste its output:

```bash
openssl rand -hex 32
```

4. Install and prepare the database:

```bash
npm install
```

```bash
npm run db:migrate
```

5. Start the app:

```bash
npm run dev
```

6. Start the background worker in a second terminal (discovery does not run without it):

```bash
npm run worker
```

7. Open http://localhost:3000.

## First-run setup

- The first visit opens **Setup**. Enter the agency name, your name, e-mail and a password (10+ characters with letters and numbers). This creates the administrator and the page then closes for good.
- Alternative from the command line (also resets a forgotten admin password):

```bash
ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" ADMIN_PASSWORD='choose-a-strong-one-1' npm run create-admin
```

## Configure without touching code

Everything below is done in the web interface by an administrator:

| Page | What you set |
|---|---|
| Settings | Agency profile used in messages, scoring weights, message templates, Do Not Contact list, your password |
| Search Providers | Enable/disable sources, paste API keys, set monthly limits, **Test connection** |
| AI Connections | Paste an AI key, choose the model, set a monthly limit, **Test connection** |
| Users & Permissions | Add team members and choose their role |

## Install as an app (PWA)

The site must be served over HTTPS (or `localhost`).

- **Android (Chrome)**: menu ⋮ → *Install app* / *Add to Home screen*.
- **iPhone / iPad (Safari)**: Share → *Add to Home Screen*.
- **Windows / macOS / Linux (Chrome or Edge)**: the install icon in the address bar.

The installed app always needs an internet connection; offline it only shows a notice page.
