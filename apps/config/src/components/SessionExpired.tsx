import { createPortal } from "preact/compat";
import { useEffect, useState } from "preact/hooks";
import { api, setUnauthorizedHandler, type AuthStatus } from "../api";
import { AuthPage } from "../auth";

// A session can lapse while you're mid-edit. Before this, api.ts threw the raw
// "unauthorized" string and nothing anywhere looked at the status code — in the
// Studio that surfaced as "Couldn't save — unauthorized" with a Retry that could
// never succeed, and the reload that fixed it discarded the unsaved board.
//
// So: re-authenticate ON TOP of the page instead of swapping the tree. The Studio
// stays mounted, its in-memory document survives, and the next save just works —
// csrfToken() re-reads the cookie per request, so the fresh CSRF token is picked
// up with no plumbing. Deliberately does NOT replay the failed request: a blind
// replay could commit a stale document against a session that is now someone else.
export function SessionExpired() {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setExpired(true));
  }, []);

  if (!expired) return null;

  return createPortal(
    <div class="session-scrim" role="dialog" aria-modal="true" aria-label="Session expired">
      <AuthPage
        mode="login"
        registrationOpen={false}
        stay
        onDone={async () => {
          // Only dismiss once the server agrees we're back in.
          try {
            const s = await api.get<AuthStatus>("/api/auth/status");
            if (s.authed) setExpired(false);
          } catch { /* leave the card up; they can try again */ }
        }}
      />
    </div>,
    document.body,
  );
}
