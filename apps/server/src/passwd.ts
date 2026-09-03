import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { destroyAllSessions, getUserByEmail, setPassword } from "./auth";

// Out-of-band password reset for the operator of a self-hosted install.
//
// Why this exists: the stock deployment is one container with no SMTP, so
// "Forgot password?" can never deliver a link. Without this, losing the password
// to your own dashboard means losing every board, screen and automation on it —
// registering again just makes an empty personal org.
//
// Sessions are live DB rows, so a reset from this second process takes effect on
// the running server immediately; no restart, no migration.

function prompt(question: string, hidden: boolean): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    if (hidden) {
      // Suppress the echo so the password never appears on screen or in a scrollback.
      const out = process.stdout as NodeJS.WriteStream & { muted?: boolean };
      out.muted = true;
      const write = out.write.bind(out);
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (!out.muted) write(s);
        else if (s.includes(question)) write(question);
      };
    }
    rl.question(question, (answer) => {
      if (hidden) process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

export async function resetPasswordCli(email: string, supplied?: string): Promise<void> {
  const user = getUserByEmail(email);
  if (!user) {
    console.error(`[passwd] no account for ${email}`);
    process.exitCode = 1;
    return;
  }
  // Read from stdin or generate — never from argv, which lands in shell history
  // and is readable by any other process via `ps`.
  let next = supplied ?? (await prompt("New password (min 8 chars, blank to generate): ", true));
  let generated = false;
  if (!next) {
    next = randomBytes(12).toString("base64url");
    generated = true;
  }
  if (next.length < 8) {
    console.error("[passwd] password must be at least 8 characters");
    process.exitCode = 1;
    return;
  }
  setPassword(user.id, next);
  destroyAllSessions(user.id); // whoever was signed in as them is signed out
  console.log(`[passwd] password reset for ${user.email} and all sessions signed out.`);
  if (generated) console.log(`[passwd] new password (shown once): ${next}`);
}

// CLI: `pnpm --filter @glanceos/server passwd you@example.com`
// In Docker: `docker compose exec glanceos pnpm --filter @glanceos/server passwd you@example.com`
// If it reports SQLITE_BUSY, another write was in flight — just run it again.
if (import.meta.url === `file://${process.argv[1]}`) {
  const email = process.argv[2];
  if (!email) {
    console.error("usage: passwd <email>            # prompts for the new password on stdin");
    process.exit(1);
  }
  await resetPasswordCli(email);
}
