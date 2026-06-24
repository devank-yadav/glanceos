# Deploy GlanceOS

GlanceOS is **one container + one SQLite file** — host it anywhere that runs a
Docker image with a small persistent volume. It's free and open-source; you run
your own instance and own your data. Pick whichever path fits.

The image is published multi-arch at `ghcr.io/devank-yadav/glanceos:latest`
(amd64 + arm64), so most options below need **no build step**.

## What every deploy needs

- **Port 8080** (the app listens on `$PORT` if set, else 8080).
- **A persistent volume mounted at `/data`** — holds the SQLite DB, uploads, and
  the auto-generated `secret.key`. Without it you lose data (and encrypted
  connection tokens) on every restart.
- **`GLANCEOS_PUBLIC_URL=https://your.domain`** — set this once you know your URL.
  It's required for OAuth redirects and for share/QR links to point at the right
  host. (Cookies become `Secure` + HSTS is sent automatically when it's `https`.)
- Everything else is optional with sane defaults (see `.env.example`).
- Behind a TLS-terminating proxy, set `GLANCEOS_TRUSTED_PROXIES=*` (or the proxy
  IPs) so rate-limiting keys on the real client IP.

> **Secrets:** if you don't set `GLANCEOS_SECRET_KEY`, one is generated to
> `/data/secret.key`. That's fine *as long as `/data` persists*. On hosts without
> a disk, set `GLANCEOS_SECRET_KEY` explicitly (a long random value) so encrypted
> tokens survive redeploys.

## 1. Docker Compose (any VPS / home server) — simplest

```bash
docker compose up -d   # uses docker-compose.yml in this repo
```
Then open `http://localhost:8080`, create your account, claim a screen. Put it
behind Caddy/Traefik/nginx for HTTPS and set `GLANCEOS_PUBLIC_URL`. Back it up
per [BACKUP.md](BACKUP.md).

## 2. Fly.io — `fly.toml` included

```bash
fly launch --copy-config --no-deploy
fly volumes create glanceos_data --size 1 --region <your-region>
fly deploy
fly secrets set GLANCEOS_PUBLIC_URL=https://<your-app>.fly.dev
```
The volume mounts at `/data`; `min_machines_running = 1` keeps the server up so
connected screens never drop their live (SSE) connection.

## 3. Render.com — `render.yaml` blueprint included

Dashboard → **New → Blueprint** → pick this repo. Set `GLANCEOS_PUBLIC_URL` to
your `…onrender.com` URL after the first deploy. **A persistent disk needs a paid
instance** — the free tier has no disk and sleeps, so use it only for a quick
demo.

## 4. Any other host (Railway, Coolify, a Pi, k8s…)

Run `ghcr.io/devank-yadav/glanceos:latest`, give it port 8080, a volume at
`/data`, and `GLANCEOS_PUBLIC_URL`. That's the whole contract.

---

### NEEDS-YOU (can't be automated)
- A **domain + DNS** pointing at your host, and TLS (most platforms above do TLS
  for you; on a raw VPS use Caddy/Traefik).
- For a **public hosted demo**: a host from the list above + the domain + setting
  `GLANCEOS_PUBLIC_URL`. Consider `GLANCEOS_REGISTRATION=closed` and a seeded
  read-only demo account so visitors can look without creating accounts.
