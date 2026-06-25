// When a self-hoster sets GLANCEOS_PUBLIC_URL, rewrite the SPA shell's social-card
// meta so it carries ABSOLUTE URLs. The built index.html ships relative tags
// (`/og.png`), which resolve against the page origin for most scrapers — but some
// (and some chat/link unfurlers) demand absolute og:image / og:url. This is a pure
// string transform so it's trivially unit-tested; api.ts applies it once at boot.

/** Inject absolute `og:url` + make `og:image`/`twitter:image` absolute, keyed off
 *  the public base URL. Idempotent and safe: no public URL → unchanged; already-
 *  absolute image tags are left alone; a missing tag is simply not added (except
 *  og:url, which is inserted after og:type when absent). */
export function injectAbsoluteOg(html: string, publicUrl: string): string {
  const base = publicUrl.replace(/\/+$/, "");
  if (!base) return html;
  let out = html;
  // Relative image tags (content starts with "/") → absolute. Leaves http(s) ones be.
  out = out.replace(
    /(<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content=")(\/[^"]*)(")/g,
    (_m, pre: string, path: string, post: string) => `${pre}${base}${path}${post}`,
  );
  // og:url — set to the canonical home if present, else insert it after og:type.
  if (/property="og:url"/.test(out)) {
    out = out.replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/, `$1${base}/$2`);
  } else if (/property="og:type"/.test(out)) {
    out = out.replace(/(<meta\s+property="og:type"[^>]*>)/, `$1\n    <meta property="og:url" content="${base}/" />`);
  }
  return out;
}
