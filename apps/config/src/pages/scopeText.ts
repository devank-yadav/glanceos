// #170 — say in plain words what a connection will be able to reach, BEFORE you
// authorize it. Providers declare raw OAuth scopes; this turns them into a sentence a
// human can judge.
//
// Trust rule: when we cannot PROVE a scope is read-only, we don't claim it is.
// Overstating safety is the one failure mode that matters here, so "unknown" reads as
// write-capable (GitHub's `repo`, for instance, grants writes despite its innocent name).

export interface ScopeInfo { label: string; readOnly: boolean; raw: string }

// Scopes that grant no data access at all — they keep the session working.
const SESSION: Record<string, string> = {
  offline_access: "Stay connected without re-signing in",
  openid: "Confirm who you are",
  profile: "Your name and avatar",
  email: "Your email address",
  "read:user": "Your basic profile",
};

// Friendlier names for the service token inside a scope.
const SERVICE: Record<string, string> = {
  calendar: "Calendar events",
  calendars: "Calendar events",
  gmail: "Email",
  mail: "Email",
  drive: "Files",
  files: "Files",
  tasks: "Tasks",
  channels: "Channels",
  groups: "Private channels",
  repo: "Repositories",
  user: "Profile",
  activity: "Activity",
  spreadsheets: "Spreadsheets",
};

const titleCase = (s: string): string => s.replace(/[-_.]+/g, " ").trim().replace(/^\w/, (c) => c.toUpperCase());

/** Does this scope demonstrably grant read-only access? Unknown → false (never overstate). */
function isReadOnly(scope: string): boolean {
  const s = scope.toLowerCase();
  if (s in SESSION) return true;
  return /(^|[.:_-])read(only)?$/.test(s) || /^read[:.]/.test(s) || /[.:_-]history$/.test(s) || /-read(-|$)/.test(s);
}

/** One raw scope → what it actually reaches, in plain words. */
export function describeScope(scope: string): ScopeInfo {
  const raw = scope.trim();
  const readOnly = isReadOnly(raw);
  const known = SESSION[raw] ?? SESSION[raw.toLowerCase()];
  if (known) return { label: known, readOnly: true, raw };

  // Google ships scopes as URLs: .../auth/calendar.readonly → calendar.readonly
  const tail = raw.replace(/^https?:\/\/[^\s]*\/auth\//, "");
  // Split off the access verb: calendar.readonly · Calendars.Read · channels:history
  const [head = tail] = tail.split(/[.:]/);
  const service = SERVICE[head.toLowerCase()] ?? titleCase(head);
  const isHistory = /[.:_-]history$/i.test(tail);
  return { label: isHistory ? `${service} history` : service, readOnly, raw };
}

/** A provider's whole scope list, de-duplicated by what it says (several raw scopes
 *  often mean the same thing to a person) and with session-only scopes last. */
export function describeScopes(scopes: string[]): ScopeInfo[] {
  const seen = new Map<string, ScopeInfo>();
  for (const s of scopes) {
    const info = describeScope(s);
    const key = `${info.label}|${info.readOnly}`;
    if (!seen.has(key)) seen.set(key, info);
  }
  const all = [...seen.values()];
  const isSession = (i: ScopeInfo) => Object.values(SESSION).includes(i.label);
  return [...all.filter((i) => !isSession(i)), ...all.filter(isSession)];
}
