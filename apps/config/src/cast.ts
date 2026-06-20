// Chromecast SENDER: from the studio, fling a board's public share link to a
// Chromecast running the GlanceOS receiver (/screen/?cast=1). The Cast Sender
// SDK + App ID are only loaded/used when the self-hoster has configured
// GLANCEOS_CAST_APP_ID, and lazily on first use (no eager third-party script).
// Mirrors the receiver namespace in apps/screen/src/cast.ts.
const CAST_NAMESPACE = "urn:x-cast:com.glanceos.cast";
const SENDER_SDK = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js";

let appId: string | null | undefined; // undefined = unknown, null = disabled
async function getAppId(): Promise<string | null> {
  if (appId === undefined) {
    try { appId = ((await (await fetch("/api/auth/status")).json()) as { castAppId?: string | null }).castAppId ?? null; }
    catch { appId = null; }
  }
  return appId ?? null;
}

/** Is casting configured on this server? (cheap — no SDK load) */
export async function castConfigured(): Promise<boolean> {
  return !!(await getAppId());
}

type CastWindow = Window & { __onGCastApiAvailable?: (a: boolean) => void; cast?: any; chrome?: any };

let sdk: Promise<boolean> | null = null;
function loadSdk(id: string): Promise<boolean> {
  if (sdk) return sdk;
  sdk = new Promise<boolean>((resolve) => {
    const w = window as CastWindow;
    w.__onGCastApiAvailable = (available: boolean) => {
      if (!available) return resolve(false);
      try {
        w.cast.framework.CastContext.getInstance().setOptions({
          receiverApplicationId: id,
          autoJoinPolicy: w.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });
        resolve(true);
      } catch { resolve(false); }
    };
    const s = document.createElement("script");
    s.src = SENDER_SDK;
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
    setTimeout(() => resolve(false), 5000); // SDK never announced → treat as unavailable
  });
  return sdk;
}

/** Pick a Cast device and send it the board's share token. Throws a friendly
 *  message when casting isn't configured or the browser can't cast. */
export async function castBoard(shareToken: string): Promise<void> {
  const id = await getAppId();
  if (!id) throw new Error("Casting isn't configured on this server");
  if (!(await loadSdk(id))) throw new Error("Casting needs Chrome or a Cast-capable browser");
  const ctx = (window as CastWindow).cast.framework.CastContext.getInstance();
  await ctx.requestSession(); // shows the native device picker
  const session = ctx.getCurrentSession();
  if (!session) throw new Error("No cast device selected");
  await session.sendMessage(CAST_NAMESPACE, { type: "board", shareToken });
}
