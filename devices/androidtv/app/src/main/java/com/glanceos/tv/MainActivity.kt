package com.glanceos.tv

import android.annotation.SuppressLint
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

/**
 * GlanceOS TV — THIN GLASS.
 *
 * This activity renders NOTHING itself. It opens a fullscreen WebView on the
 * GlanceOS web runtime (<GLANCEOS_URL>/screen/?tv=1) and that runtime draws the
 * whole dashboard, shows the pairing QR/claim code on first run, does D-pad
 * navigation, wake-lock, burn-in shift, sleep blanking and overscan margins.
 *
 * The shell's entire job:
 *   1. load the URL fullscreen,
 *   2. keep the screen awake at the OS level,
 *   3. let the WebView take focus so remote KeyEvents reach the page.
 *
 * It MUST NOT contain: layout parsing/rendering, board/settings state, a pairing
 * UI, or any secret store. The only persisted identity is what the runtime keeps
 * in the WebView's localStorage (DOM storage, enabled below).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep the panel on while we're foreground. We do NOT rely on the web
        // wake-lock alone — this is the OS-level guarantee the brief asks for.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = WebView(this)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true          // the runtime is a JS app
            domStorageEnabled = true          // device identity lives in localStorage
            databaseEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false  // dashboards auto-play media
            // Old Fire TV WebViews default to a tiny cache; let it use disk.
            cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        }

        // Stay inside the WebView for same-host navigation; never spawn a browser.
        web.webViewClient = WebViewClient()

        // The WebView must own focus so D-pad / Enter / Back KeyEvents land on the
        // page. We do NOT intercept arrows or Enter — the web runtime handles
        // ArrowUp/Down/Left/Right, Enter, Escape, XF86Back, BrowserBack, GoBack,
        // Backspace itself (see apps/screen/src/nav.ts).
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        web.requestFocus()

        web.loadUrl(buildUrl())
    }

    /**
     * <GLANCEOS_URL>/screen/?tv=1&platform=<firetv|androidtv>&native=<version>
     *
     * Fire TV reports "Amazon" as the manufacturer; everything else is treated as
     * generic Android TV. The platform/native params are read by the runtime
     * (apps/screen/src/api.ts) so the owner's fleet shows what's running the screen.
     */
    private fun buildUrl(): String {
        val base = BuildConfig.GLANCEOS_URL.trimEnd('/')
        val platform =
            if (Build.MANUFACTURER.equals("Amazon", ignoreCase = true)) "firetv" else "androidtv"
        return "$base/screen/?tv=1&platform=$platform&native=${BuildConfig.VERSION_NAME}"
    }

    /** True immersive fullscreen: no status bar, no nav bar, sticky. */
    private fun enterImmersive() {
        @Suppress("DEPRECATION")
        web.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enterImmersive()
            web.requestFocus()
        }
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        enterImmersive()
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    /**
     * Handle the hardware BACK gracefully. The web runtime treats Back as an
     * in-app "go up / close overlay" key, so we forward it to the page instead of
     * exiting. We never tear the app down on a stray Back — a kiosk should not be
     * one button-press away from dumping the user on the launcher.
     *
     * On modern Android the WebView consumes Back via the KeyEvent it already
     * receives (it has focus); this override is the belt-and-braces fallback for
     * the cases where Back would otherwise bubble up to finish() the activity.
     */
    @Deprecated("Kept intentionally: keep BACK inside the page, never exit the kiosk.")
    override fun onBackPressed() {
        // Let the page act on its own history first.
        if (web.canGoBack()) {
            web.goBack()
        }
        // Otherwise: swallow it. Do NOT call super.onBackPressed() — staying on the
        // dashboard is the correct behavior for an always-on screen.
    }

    override fun onDestroy() {
        // Detach the WebView from the view tree before destroying to avoid leaks.
        (web.parent as? android.view.ViewGroup)?.removeView(web)
        web.destroy()
        super.onDestroy()
    }
}
