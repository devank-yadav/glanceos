# GlanceOS HTTP API (scoped keys)

GlanceOS exposes a small, scoped HTTP API for automation and integrations. It is
the **same** server the config app and screens use — there is no separate API
host. Authenticate with a scoped API key; everything is on your own install, so
all URLs below are relative to your server's origin (e.g. `https://glance.example`).

> The config app authenticates with a session cookie + CSRF token. API keys are
> for *programmatic* callers (scripts, Home Assistant, cron jobs, webhooks you
> drive yourself). A session implicitly has every scope; a key has only the
> scopes you grant it.

## Getting a key

Account → **API keys** → name it, tick the scopes, **Create key**. The token
(`gos_…`) is shown **once** — copy it immediately; only its hash is stored, so it
can never be displayed again. Lost it? Revoke and mint a new one.

## Authenticating

Send the token as a Bearer header:

```
Authorization: Bearer gos_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Because a `Bearer` header is non-ambient (a browser can't attach it cross-site),
key requests are **CSRF-immune** and need **no** `x-csrf-token`. Send JSON bodies
with `Content-Type: application/json`.

Responses: `200`/`201` on success; `401` invalid/revoked key; `403` the key is
missing the required scope, or the endpoint isn't available to keys at all;
`404` not found; `429` rate-limited.

## Scopes

| Scope           | Grants                                             |
| --------------- | -------------------------------------------------- |
| `tasks:read`    | List task items                                    |
| `tasks:write`   | Create, update, delete task items                  |
| `queues:write`  | Read a queue and advance / set-waiting / reset it  |
| `devices:read`  | List your screens                                  |
| `layouts:read`  | List boards and read a board's document            |
| `data:write`    | Write custom-data keys (used by the reactive layer)|

Keys are **deny-by-default**: only the endpoints below are reachable with a key.
Everything else (board edits, device management, key management itself, account
settings) stays session-only.

## Endpoints

### Tasks
```
GET    /api/tasks?listId=default            # tasks:read
POST   /api/tasks            {listId, text} # tasks:write → 201 the new item
PATCH  /api/tasks/:id        {text?, done?} # tasks:write
DELETE /api/tasks/:id                       # tasks:write
```

### Queues
```
GET  /api/queues/:id                        # queues:write
POST /api/queues/:id/advance                # queues:write
POST /api/queues/:id/waiting {waiting}      # queues:write
POST /api/queues/:id/reset                  # queues:write
```

### Screens & boards (read)
```
GET /api/devices                            # devices:read
GET /api/layouts                            # layouts:read
GET /api/layouts/:id                        # layouts:read → {document, …}
```

### Custom data (reactive layer)
```
POST /api/data/:key  {value}                # data:write
```

## Examples

```bash
KEY=gos_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
BASE=https://glance.example

# Add a task
curl -s -X POST "$BASE/api/tasks" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"listId":"default","text":"Refill the coffee"}'

# Advance the clinic queue
curl -s -X POST "$BASE/api/queues/clinic/advance" \
  -H "Authorization: Bearer $KEY"

# List your screens
curl -s "$BASE/api/devices" -H "Authorization: Bearer $KEY"
```

## Notes

- Keys are rate-limited like the rest of the API. A key's **last used** timestamp
  is recorded (throttled to once a minute) and shown on the account page.
- Revoking a key takes effect immediately on the next request.
- Keep keys secret. Anyone with the token has exactly its scopes until revoked.
