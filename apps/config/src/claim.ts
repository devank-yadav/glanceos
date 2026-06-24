// QR pairing deep-link. The on-screen runtime draws a QR encoding
// `<origin>/?claim=<code>`; when a phone scans it the config app boots with that
// query, captures the code (main.tsx), and the Screens page prefills + auto-submits
// the claim form — so pairing is truly "scan, done", no typing.

export const PENDING_CLAIM_KEY = "glanceos.pendingClaim";

/** Pull a claim code out of a URL search string, sanitized. Returns null if
 *  there's no usable code. Claim codes are short alphanumerics with dashes. */
export function parseClaimCode(search: string): string | null {
  try {
    const raw = new URLSearchParams(search).get("claim");
    if (!raw) return null;
    const code = raw.trim().replace(/[^A-Za-z0-9-]/g, "").slice(0, 16);
    return code.length >= 4 ? code : null;
  } catch {
    return null;
  }
}
