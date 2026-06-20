import { db } from "./db";
import { currentKeyVersion, open, seal } from "./secrets";

// Re-encrypt every stored secret with the CURRENT key and stamp the current
// key_version. open() falls back to GLANCEOS_SECRET_KEY_PREVIOUS, so during a
// rotation: set GLANCEOS_SECRET_KEY=new + GLANCEOS_SECRET_KEY_PREVIOUS=old, run
// this once, then drop _PREVIOUS. Undecryptable rows (wrong/lost key) are left
// untouched and counted.
export function rotateSecrets(): { connections: number; apps: number; failed: number } {
  const kv = currentKeyVersion();
  let connections = 0, apps = 0, failed = 0;
  const tx = db.transaction(() => {
    for (const r of db.prepare("SELECT connection_id, kind, cipher FROM connection_secrets").all() as { connection_id: string; kind: string; cipher: Buffer }[]) {
      const plain = open(r.cipher);
      if (plain == null) { failed++; continue; }
      db.prepare("UPDATE connection_secrets SET cipher = ?, key_version = ? WHERE connection_id = ? AND kind = ?").run(seal(plain), kv, r.connection_id, r.kind);
      connections++;
    }
    for (const r of db.prepare("SELECT provider, user_id, client_secret_enc FROM oauth_apps").all() as { provider: string; user_id: string; client_secret_enc: Buffer }[]) {
      const plain = open(r.client_secret_enc);
      if (plain == null) { failed++; continue; }
      db.prepare("UPDATE oauth_apps SET client_secret_enc = ?, key_version = ? WHERE provider = ? AND user_id = ?").run(seal(plain), kv, r.provider, r.user_id);
      apps++;
    }
  });
  tx();
  return { connections, apps, failed };
}

/** Count stored secrets that don't decrypt with the current/previous key. */
export function undecryptableSecretCount(): number {
  let n = 0;
  for (const r of db.prepare("SELECT cipher FROM connection_secrets").all() as { cipher: Buffer }[]) if (open(r.cipher) == null) n++;
  for (const r of db.prepare("SELECT client_secret_enc AS cipher FROM oauth_apps").all() as { cipher: Buffer }[]) if (open(r.cipher) == null) n++;
  return n;
}

// CLI: `pnpm --filter @glanceos/server rotate-secrets`
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = rotateSecrets();
  console.log(`[rotate] re-encrypted ${r.connections} connection secret(s) + ${r.apps} oauth app(s) at key_version ${currentKeyVersion()}; ${r.failed} undecryptable (skipped).`);
}
