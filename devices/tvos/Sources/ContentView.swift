import SwiftUI

// ContentView — hosts the GlanceOS web runtime full-screen.
//
// The Siri Remote drives focus and emits arrow / Enter / Menu(Back) events that
// WKWebView delivers to the web content as standard KeyboardEvents. The page
// (loaded with ?tv=1) already implements D-pad spatial navigation, so this shell
// does NOT reimplement navigation — it just gives the webview focus and gets out
// of the way.

struct ContentView: View {

    // ── CHANGE ME ─────────────────────────────────────────────────────────────
    // Point this at YOUR self-hosted GlanceOS server's base URL. GlanceOS is
    // plain HTTP on the LAN by default (see ../README.md and the project's
    // DEVICE-API.md). Examples:
    //     "http://glanceos.local:8080"   (mDNS hostname, the project default)
    //     "http://192.168.1.42:8080"     (a fixed LAN IP)
    // Do NOT ship a real public domain here.
    static let host = "http://glanceos.local:8080"
    // ──────────────────────────────────────────────────────────────────────────

    // Bump when you change the shell so the fleet view can tell which build is
    // running. This is the value passed as &native=<version> below.
    static let nativeVersion = "1.0.0"

    // The exact contract URL. ?tv=1 turns on the runtime's kiosk behaviour
    // (fullscreen, wake-lock, D-pad nav, pixel-shift, wake/sleep, overscan-safe
    // margins). platform=tvos tags this device in the fleet; native=<ver> reports
    // the shell build. The shell adds NO query params of its own beyond these.
    static var screenURL: URL {
        URL(string: "\(host)/screen/?tv=1&platform=tvos&native=\(nativeVersion)")!
    }

    var body: some View {
        WebView(url: ContentView.screenURL)
            .ignoresSafeArea()          // true fullscreen; overscan margins are the runtime's job
            .edgesIgnoringSafeArea(.all)
    }
}
