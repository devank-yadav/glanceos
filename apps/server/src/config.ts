// Fail-fast validation of GLANCEOS_* env at boot, so a misconfiguration surfaces
// as a clear error instead of confusing runtime behavior. Hard problems throw;
// softer risks just warn. Pure (takes an env map) so it's unit-testable.

export interface ConfigIssues { errors: string[]; warnings: string[] }

export function checkConfig(env: NodeJS.ProcessEnv = process.env): ConfigIssues {
  const errors: string[] = [];
  const warnings: string[] = [];

  const num = (name: string, opts: { min?: number; int?: boolean } = {}) => {
    const raw = env[name];
    if (raw == null || raw === "") return;
    const n = Number(raw);
    if (!Number.isFinite(n) || (opts.int && !Number.isInteger(n)) || (opts.min != null && n < opts.min)) {
      errors.push(`${name}=${raw} is not a valid ${opts.int ? "integer" : "number"}${opts.min != null ? ` >= ${opts.min}` : ""}`);
    }
  };
  const url = (name: string) => {
    const raw = env[name];
    if (!raw) return;
    try { const u = new URL(raw); if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme"); }
    catch { errors.push(`${name}=${raw} must be an http(s) URL`); }
  };

  num("PORT", { int: true, min: 1 });
  num("GLANCEOS_UPLOAD_QUOTA_MB", { min: 0 });
  num("GLANCEOS_KEY_VERSION", { int: true, min: 1 });
  num("GLANCEOS_LOW_BATTERY_PCT", { min: 0 });
  num("GLANCEOS_OFFLINE_MINUTES", { min: 0 });
  url("GLANCEOS_PUBLIC_URL");

  if (env.GLANCEOS_SECRET_KEY && env.GLANCEOS_SECRET_KEY.length < 16) warnings.push("GLANCEOS_SECRET_KEY is short (<16 chars) — use a long random value");
  if (env.GLANCEOS_SECRET_KEY_PREVIOUS && !env.GLANCEOS_SECRET_KEY) warnings.push("GLANCEOS_SECRET_KEY_PREVIOUS is set without GLANCEOS_SECRET_KEY — rotation has no new key");
  if (env.GLANCEOS_RATE_LIMIT === "off") warnings.push("GLANCEOS_RATE_LIMIT=off — rate limiting is disabled");
  if (env.GLANCEOS_ALLOW_PRIVATE_EGRESS === "1") warnings.push("GLANCEOS_ALLOW_PRIVATE_EGRESS=1 — the SSRF guard is OFF (trust your boards' URLs)");

  return { errors, warnings };
}

/** Validate process.env at boot: log warnings, throw on hard errors. */
export function validateConfig(): void {
  const { errors, warnings } = checkConfig();
  for (const w of warnings) console.warn(`[config] ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`[config] ${e}`);
    throw new Error(`invalid configuration — fix the ${errors.length} error(s) above`);
  }
}
