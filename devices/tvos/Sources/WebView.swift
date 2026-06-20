import SwiftUI
import WebKit

// WebView — a UIViewRepresentable wrapper around WKWebView.
//
// Responsibilities (and ONLY these):
//   1. Load the GlanceOS runtime URL full-screen with JavaScript enabled.
//   2. Keep the panel awake at the OS level (isIdleTimerDisabled) — we do not
//      rely solely on the web runtime's Screen Wake Lock.
//   3. Let standard Siri Remote key events reach the page (the webview holds
//      focus; the page handles ArrowUp/Down/Left/Right, Enter, Escape, and the
//      Back variants itself).
//
// It deliberately does NOT inject scripts, intercept navigation, parse layouts,
// store secrets, or render any UI. The web runtime is the source of truth.

struct WebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()

        // JavaScript on (the runtime is a JS app). WKWebpagePreferences is the
        // modern, non-deprecated switch.
        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        // The runtime may show media (e.g. weather/clock animations); allow it to
        // play inline rather than taking over the screen, and without a tap gate
        // since there is no pointer on a TV.
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.backgroundColor = .black
        webView.isOpaque = true
        webView.scrollView.isScrollEnabled = false   // it's a fixed kiosk surface, not a scroll page
        webView.scrollView.bounces = false

        // Keep the Apple TV awake at the OS level. The web Wake Lock API is a
        // belt; this is the suspenders. Without it tvOS can dim/screensave.
        UIApplication.shared.isIdleTimerDisabled = true

        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // Stateless shell — the runtime drives all updates over SSE. Nothing to
        // push from SwiftUI on re-render.
    }
}
