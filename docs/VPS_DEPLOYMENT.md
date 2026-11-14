# VPS deployment (Ubuntu)

This guide puts the whole system on one Linux server: database, web app, background worker, HTTPS and daily backups. Nothing depends on your own computer afterwards.

> These steps are prepared and the configuration files are validated, but **your** deployment only counts as done after step 8 succeeds on your server.

## What you need

- An Ubuntu 22.04 or 24.04 VPS with at least 2 GB RAM (1 GB works only with swap enabled).
- A domain or sub-domain, for example `leads.example.com`.
- SSH access to the server.

## 1. Point the domain to the server

At your domain registrar add an **A record**: name `leads` (or `@`), value = the server's IP address. Wait until `ping leads.example.com` shows that IP.

## 2. Install Docker on the server

```bash
curl -fsSL https://get.docker.com | sudo sh
```

```bash
sudo usermod -aG docker $USER
```

Log out and back in so the group change applies.

## 3. Open the firewall

```bash
sudo ufw allow OpenSSH
```

```bash
sudo ufw allow 80,443/tcp
```

```bash
sudo ufw enable
```

## 4. Put the project on the server

Copy the project folder to the server (with `git clone` from your own repository, or `scp -r phoenix-lead-finder user@server:~/`), then:

```bash
cd ~/phoenix-lead-finder
```

## 5. Create the settings file

```bash
cp .env.example .env
```

```bash
nano .env
```

Set these values:

| Setting | Value |
|---|---|
| `POSTGRES_PASSWORD` | a long random password (letters and digits only) |
| `DATABASE_URL` | same password inside it: `postgresql://phoenix:THE_PASSWORD@db:5432/phoenix` |
| `ENCRYPTION_KEY` | output of `openssl rand -hex 32` |
| `APP_URL` | `https://leads.example.com` |
| `DOMAIN` | `leads.example.com` |
| `CRAWLER_CONTACT` | an e-mail address websites can contact about the crawler (recommended) |

Protect the file:

```bash
chmod 600 .env
```

**Keep a copy of `ENCRYPTION_KEY` somewhere safe.** Without it, saved API keys cannot be decrypted after a restore.

## 6. Start everything

```bash
docker compose up -d --build
```

This builds the app, creates the database, applies migrations, starts the web app, the **background worker**, HTTPS and the daily backup.

Check that all services are running:

```bash
docker compose ps
```

## 7. HTTPS

Nothing to do: Caddy requests and renews the certificate automatically for `DOMAIN`. It needs ports 80 and 443 open and the DNS record from step 1.

## 8. Verify and create the administrator

Open `https://leads.example.com`. You should see the **Setup** page with a valid padlock. Create the administrator there.

Also confirm:

```bash
curl -s https://leads.example.com/api/health
```

should print `{"status":"ok"}`, and the worker log should show `worker started`:

```bash
docker compose logs --tail 20 worker
```

Then in the app: **Search Providers → OpenStreetMap → Test connection**.

## 9. Add API keys (optional, any time)

Keys are pasted in the web interface (Search Providers / AI Connections), not in files. They are encrypted in the database. See [SEARCH_PROVIDERS.md](SEARCH_PROVIDERS.md) and [AI_CONFIGURATION.md](AI_CONFIGURATION.md).

## 10. Install the PWA on other devices

Open the same address on any phone or computer, sign in, and install it (see [INSTALLATION.md](INSTALLATION.md)). All devices share the same data.

## Backups

- A compressed backup is written every day to `backups/` in the project folder; files older than 14 days are removed.
- Make one right now:

```bash
docker compose exec backup sh /backup.sh
```

- Copy the `backups/` folder off the server regularly (another server, cloud storage). A backup that lives only on the same disk does not protect you from losing the server.
- Restore (replaces all current data):

```bash
sh deploy/restore.sh backups/phoenix-YYYYMMDD-HHMMSS.sql.gz
```

## Updating safely

```bash
docker compose exec backup sh /backup.sh
```

Replace the project files with the new version (keep your `.env` and `backups/`), then:

```bash
docker compose up -d --build
```

Database migrations are applied automatically when the web service starts. Browsers and installed PWAs pick up the new version on their next load.

## Useful commands

| Purpose | Command |
|---|---|
| Live logs | `docker compose logs -f web worker` |
| Restart | `docker compose restart web worker` |
| Stop | `docker compose down` (data stays in the volumes) |
| Reset an admin password | `docker compose exec -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='new-password-1' web npx tsx scripts/create-admin.ts` |

## Zero-cost hosting note

Any provider that gives you an Ubuntu VM works. Some clouds advertise an always-free VM tier; availability and terms change, so check the provider's current offer before relying on it.
