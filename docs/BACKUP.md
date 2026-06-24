# Backup & restore

GlanceOS keeps everything — accounts, boards, devices, connections, uploads — in
**one SQLite file** (`<data>/glanceos.db`) plus its WAL sidecars. That makes
backup simple, but it also means the volume *is* your data: back it up.

There are two layers: **logical snapshots** (a consistent copy of the DB you can
keep a rolling history of) and **volume backups** (the whole `/data` directory,
including uploaded images).

## Logical snapshots (recommended)

A snapshot is an online, consistent copy of the live database (better-sqlite3's
page-copy backup) — safe to run while the server is serving traffic.

**On demand:**

```bash
pnpm --filter @glanceos/server backup
# → writes <data>/backups/glanceos-YYYY-MM-DD_HH-MM-SS.db and prunes to the newest 14
```

**In Docker:**

```bash
docker compose exec glanceos node apps/server/dist/backup-db.js   # if built
# or, against the source image:
docker compose exec glanceos sh -c "cd apps/server && pnpm backup"
```

**Scheduled (inside the server process):** set these and the server snapshots
itself on an interval and keeps a rolling window — no cron needed.

| Env | Default | Meaning |
|-----|---------|---------|
| `GLANCEOS_BACKUP_INTERVAL_HOURS` | _off_ | snapshot every N hours (e.g. `6`) |
| `GLANCEOS_BACKUP_KEEP` | `14` | how many snapshots to retain |
| `GLANCEOS_BACKUP_DIR` | `<data>/backups` | where snapshots are written |

Snapshots live **inside the data volume by default**, so a logical snapshot is
protection against accidental deletion / row-level mistakes — for hardware/volume
loss, also do a volume backup (below) or point `GLANCEOS_BACKUP_DIR` at a
separate mount.

## Volume backup (full, includes uploads)

Tar the whole named volume so you also capture uploaded images and any snapshots:

```bash
docker run --rm \
  -v glanceos-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/glanceos-data-$(date +%F).tgz -C / data
```

## Restore

1. **Stop the server** (`docker compose down`, or stop the process). SQLite WAL
   means you should never swap the DB file out from under a running server.
2. Put the snapshot in place as the live DB and remove stale sidecars:
   ```bash
   cp glanceos-YYYY-MM-DD_HH-MM-SS.db <data>/glanceos.db
   rm -f <data>/glanceos.db-wal <data>/glanceos.db-shm
   ```
   (For a full volume backup, restore the tar into the volume instead.)
3. **Start the server.** Migrations are idempotent, so a snapshot from an older
   build is brought up to the current schema automatically on boot.

> Secrets (OAuth tokens, connection keys) are encrypted at rest with
> `GLANCEOS_SECRET_KEY`. A restored DB is only readable with the **same** key —
> back up your key material separately and securely.
