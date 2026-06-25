/*
 * GlanceOS — Tizen TV shell (dumb glass)
 * ---------------------------------------
 * This file is the ENTIRE app logic. Its only jobs are:
 *   1. Register the TV remote's directional / Enter / Back keys so the web
 *      runtime receives them as standard KeyboardEvents.
 *   2. Redirect the webview to the self-hosted GlanceOS runtime in ?tv=1 mode.
 *
 * It renders nothing, parses no layouts, stores no board/settings state, and
 * has no pairing UI. The runtime at HOST does all of that. The only identity
 * that ever persists lives in the runtime's own localStorage, inside the
 * webview — not here.
 */

/* ===========================================================================
 * CHANGE ME — point this at YOUR self-hosted GlanceOS server.
 * Use your server's LAN address or hostname. The default below is a
 * placeholder and will not resolve on your network.
 * Examples:
 *   var HOST = "http://glanceos.local:8080";
 *   var HOST = "http://192.168.1.50:8080";
 * Do NOT add a trailing slash.
 * =========================================================================== */
var HOST = "http://glanceos.local:8080";

/* C3 — runtime-configurable host: the TV remembers the server you enter on the
 * first-run setup screen (in webview localStorage), so you no longer have to
 * edit HOST and rebuild the .wgt per deployment. A saved host always wins; the
 * HOST above is only the fallback default. Re-open with ?setup to change it. */
var HOST_KEY = "glanceos.host";
var PLACEHOLDER = "http://glanceos.local:8080";

/* Shell version, reported to the runtime via &native= for diagnostics only. */
var NATIVE_VERSION = "1.0.0";

/* The platform id for this shell, per the GlanceOS device protocol. */
var PLATFORM_ID = "tizen";

/* ---------------------------------------------------------------------------
 * 1. Register TV remote keys.
 *
 * On Tizen TV, hardware remote keys do not reach the page as KeyboardEvents
 * unless the app registers them with tizen.tvinputdevice.registerKey(). We
 * register exactly the keys the GlanceOS runtime listens for. Tizen delivers
 * the directional/Enter keys with the standard KeyboardEvent.key values the
 * runtime already understands ("ArrowUp", "Enter", etc.), so no remapping is
 * needed. "Return" is the TV's Back button; the runtime listens for back via
 * XF86Back / BrowserBack / GoBack / Backspace, and Tizen surfaces the
 * registered Return key in a way the runtime's back handling catches.
 *
 * Everything is guarded behind typeof checks so the page also runs in a plain
 * desktop browser during development (where the OS already sends key events).
 * ------------------------------------------------------------------------- */
function registerRemoteKeys() {
  try {
    if (typeof window.tizen === "undefined" ||
        typeof window.tizen.tvinputdevice === "undefined") {
      return; // Not on a Tizen TV (e.g. desktop dev) — nothing to register.
    }

    var keys = [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      // "Enter" (the remote's center/OK key) is always available and need not
      // be registered, but listing it is harmless and explicit.
      "Enter",
      // "Return" is the TV's Back button. Registering it stops the platform
      // from swallowing it and lets the page handle "go back".
      "Return"
    ];

    // registerKeyBatch is the modern call; fall back to registerKey per name.
    if (typeof window.tizen.tvinputdevice.registerKeyBatch === "function") {
      window.tizen.tvinputdevice.registerKeyBatch(keys);
    } else if (typeof window.tizen.tvinputdevice.registerKey === "function") {
      for (var i = 0; i < keys.length; i++) {
        try {
          window.tizen.tvinputdevice.registerKey(keys[i]);
        } catch (e) {
          /* Some keys are always registered and throw; ignore. */
        }
      }
    }
  } catch (e) {
    /* Never let key registration block the redirect. */
  }
}

/* ---------------------------------------------------------------------------
 * 2. Keep the screen awake at the OS level.
 *
 * The runtime requests a web wake-lock in ?tv=1 mode, but the spec says the
 * shell must not rely on that alone. Tizen's power API keeps the panel on.
 * Guarded so it is a no-op off-device.
 * ------------------------------------------------------------------------- */
function keepScreenAwake() {
  try {
    if (typeof window.tizen !== "undefined" &&
        typeof window.tizen.power !== "undefined") {
      // SCREEN / SCREEN_NORMAL: keep the display on at normal brightness.
      window.tizen.power.request("SCREEN", "SCREEN_NORMAL");
    }
  } catch (e) {
    /* Wake-lock is best-effort; the runtime also requests its own. */
  }
}

/* ---------------------------------------------------------------------------
 * 3. Build the runtime URL and redirect.
 *
 * Contract:  <HOST>/screen/?tv=1&platform=tizen&native=<version>
 * The runtime then auto-registers the device, shows the QR + claim code, and
 * opens the SSE live stream. We add nothing to this flow.
 * ------------------------------------------------------------------------- */
function normalizeHost(s) {
  s = String(s || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "http://" + s; // bare host/IP → http for LAN
  return s.replace(/\/+$/, ""); // strip any trailing slashes
}

/* Saved host (set on the setup screen) wins; else the baked HOST unless it is
 * still the shipped placeholder (which never resolves). "" = needs setup. */
function resolveHost() {
  var saved = "";
  try { saved = (localStorage.getItem(HOST_KEY) || "").trim(); } catch (e) {}
  if (saved) return normalizeHost(saved);
  return HOST === PLACEHOLDER ? "" : normalizeHost(HOST);
}

function go(host) {
  var url = host +
    "/screen/?tv=1" +
    "&platform=" + encodeURIComponent(PLATFORM_ID) +
    "&native=" + encodeURIComponent(NATIVE_VERSION);
  window.location.replace(url);
}

/* First-run / ?setup screen: ask once for the server, remember it, then go.
 * Plain DOM so a TV remote can focus the field and the OK button. */
function showSetup(prefill) {
  var root = document.getElementById("msg") || document.body;
  root.innerHTML =
    '<div style="max-width:80vw;margin:0 auto;font-size:22px;line-height:1.5">' +
    '<div style="color:#ddd;font-size:26px;margin-bottom:18px">Connect this screen to GlanceOS</div>' +
    '<div style="margin-bottom:10px">Enter your server address:</div>' +
    '<input id="hostInput" type="text" value="' + (prefill || "") + '" placeholder="http://192.168.1.50:8080" ' +
    'style="width:100%;box-sizing:border-box;font-size:24px;padding:12px;border-radius:8px;border:2px solid #444;background:#111;color:#fff" />' +
    '<button id="hostGo" style="margin-top:16px;font-size:24px;padding:12px 28px;border-radius:8px;border:0;background:#fafafa;color:#191919;cursor:pointer">Connect</button>' +
    '<div style="margin-top:14px;color:#666;font-size:16px">It is remembered on this TV — no rebuild needed. Re-open with ?setup to change it.</div>' +
    '</div>';
  var input = document.getElementById("hostInput");
  var btn = document.getElementById("hostGo");
  var submit = function () {
    var host = normalizeHost(input.value);
    if (!host) { try { input.focus(); } catch (e) {} return; }
    try { localStorage.setItem(HOST_KEY, host); } catch (e) {}
    go(host);
  };
  if (btn) btn.addEventListener("click", submit);
  if (input) input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
  try { if (input) input.focus(); } catch (e) {}
}

/* ---------------------------------------------------------------------------
 * Boot.
 * ------------------------------------------------------------------------- */
function boot() {
  registerRemoteKeys();
  keepScreenAwake();
  // Give the webview focus so key events land on the page after redirect.
  try { window.focus(); } catch (e) {}
  var forceSetup = /[?&]setup\b/.test(location.search);
  var host = resolveHost();
  if (!host || forceSetup) showSetup(host || ""); else go(host);
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  boot();
} else {
  window.addEventListener("DOMContentLoaded", boot);
}
