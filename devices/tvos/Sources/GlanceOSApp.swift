import SwiftUI

// GlanceOS tvOS shell — @main entry point.
//
// This app is THIN GLASS. It renders nothing of its own: it opens the GlanceOS
// web runtime in a fullscreen WKWebView and that runtime draws everything
// (layouts, the first-run claim QR, live SSE updates, D-pad navigation,
// wake/sleep, burn-in pixel-shift). The Apple TV's only jobs are: load the URL,
// keep the panel awake at the OS level, and deliver Siri Remote key events to
// the web page. See README.md ("Must never contain").

@main
struct GlanceOSApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
