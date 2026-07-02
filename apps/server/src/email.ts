// Provider-abstracted transactional/lifecycle mailer. Inert by default: with no
// provider env set, sendEmail() logs "[email:noop]" and returns false — it NEVER
// throws, so a missing key (dev, CI, an un-configured install) can't crash a request
// or a background tick. Mirrors the env-gated OAuth-app pattern: a missing credential
// degrades gracefully instead of erroring. Two backends, in priority order:
//   • RESEND_API_KEY → Resend HTTP API (zero extra deps; uses the global fetch)
//   • SMTP_HOST (+ SMTP_PORT/SMTP_USER/SMTP_PASS) → nodemailer, imported dynamically
//     so it stays an OPTIONAL dependency (same trick as the opt-in `ioredis` scale path)

// #44 — optional attachments (board snapshots). Kept tiny: filename + raw bytes; each
// backend maps to its own wire shape (Resend wants base64, nodemailer takes a Buffer).
export interface EmailAttachment { filename: string; content: Buffer; contentType?: string }
export interface EmailMessage { text?: string; html?: string; attachments?: EmailAttachment[] }

type Backend = "resend" | "smtp" | null;

function backend(): Backend {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST) return "smtp";
  return null;
}

const fromAddress = (): string => process.env.GLANCEOS_EMAIL_FROM || "GlanceOS <noreply@glanceos.app>";

/** Whether a real mail backend is configured. When false, sendEmail is a logging no-op. */
export function emailConfigured(): boolean {
  return backend() !== null;
}

/** Absolute URL for a link in an email (verify / reset / invite). Honors
 *  GLANCEOS_PUBLIC_URL behind a proxy; falls back to localhost in dev. */
export function publicUrl(path = ""): string {
  const base = (process.env.GLANCEOS_PUBLIC_URL || "http://localhost:8080").replace(/\/+$/, "");
  if (!path) return base;
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Send an email. Best-effort: logs + swallows on failure and NEVER throws, so callers
 *  (request handlers, cron ticks) treat mail as fire-and-forget. Returns whether a
 *  message was actually dispatched (false = no backend configured, or a send error). */
export async function sendEmail(to: string, subject: string, msg: EmailMessage): Promise<boolean> {
  const b = backend();
  if (!b) {
    console.log("[email:noop]", to, "—", subject);
    return false;
  }
  try {
    return b === "resend" ? await sendViaResend(to, subject, msg) : await sendViaSmtp(to, subject, msg);
  } catch (e) {
    console.error("[email] send failed:", (e as Error).message);
    return false;
  }
}

async function sendViaResend(to: string, subject: string, msg: EmailMessage): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: fromAddress(), to, subject, text: msg.text, html: msg.html,
      attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
    }),
  });
  if (!res.ok) {
    console.error(`[email] Resend ${res.status}: ${await res.text().catch(() => "")}`);
    return false;
  }
  return true;
}

// Minimal structural type for just the nodemailer calls we use (avoids a hard dep).
interface MailTransport { sendMail(opts: Record<string, unknown>): Promise<unknown> }
let transport: MailTransport | null = null;

async function sendViaSmtp(to: string, subject: string, msg: EmailMessage): Promise<boolean> {
  if (!transport) {
    // Non-literal specifier so tsc doesn't try to resolve the optional module.
    const specifier = "nodemailer";
    const mod = (await import(specifier).catch(() => null)) as { createTransport(opts: unknown): MailTransport } | null;
    if (!mod?.createTransport) {
      console.error("[email] SMTP_HOST is set but 'nodemailer' isn't installed. Run: pnpm --filter @glanceos/server add nodemailer");
      return false;
    }
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = mod.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === "1" || port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  await transport.sendMail({
    from: fromAddress(), to, subject, text: msg.text, html: msg.html,
    attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
  });
  return true;
}
