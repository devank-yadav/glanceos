# devices/androidtv

A native **Android TV / Fire TV** shell — the owner's primary big-screen hardware (a Fire TV stick). Powers on into the GlanceOS dashboard with no keyboard, controlled by the remote. This is a real, minimal Gradle/Kotlin app you build and sideload; the existing `pi-image/` and `esp32-eink/` device dirs are empty-on-purpose, this one is not.

## Download (prebuilt)

Every version tag publishes a **debug-signed `glanceos-androidtv.apk`** on the
repo's [GitHub Releases](https://github.com/devank-yadav/glanceos/releases)
(built by `.github/workflows/release.yml` — no signing secrets needed). Sideload
it (`adb install glanceos-androidtv.apk`, or enable “install unknown apps”). You
can also trigger a build any time via **Actions → release → Run workflow** and
grab the APK from the run's artifacts. Prefer to build it yourself? See below.

## What it is

A single-activity app that opens a fullscreen `WebView` on your self-hosted GlanceOS server and gets out of the way. It loads:

```
<GLANCEOS_URL>/screen/?tv=1&platform=<firetv|androidtv>&native=<version>
```

and the GlanceOS web runtime (`apps/screen`) draws **everything** — the dashboard, the first-run pairing QR + claim code, D-pad navigation, the screen wake-lock, burn-in pixel-shift, wake/sleep blanking, and overscan-safe margins. The platform is `firetv` when `Build.MANUFACTURER` is `Amazon`, otherwise `androidtv`; those params let the owner's fleet show what's running each screen.

## Dumb glass

This app is **thin glass**. It renders nothing itself. Its entire job is three things:

1. load the URL in a maximised, immersive fullscreen WebView;
2. keep the screen awake at the OS level (`FLAG_KEEP_SCREEN_ON` + `WAKE_LOCK` permission) — it does **not** rely only on the web wake-lock;
3. give the WebView focus so remote/D-pad `KeyEvent`s reach the page. The web runtime listens for `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Enter`, `Escape`, `XF86Back`, `BrowserBack`, `GoBack`, `Backspace` (see `apps/screen/src/nav.ts`) — the shell forwards them and never reimplements navigation.

The server is the source of truth. The shell adds **zero** new server endpoints; it reuses the existing device protocol (register → on-screen QR claim → SSE live updates, see `docs/DEVICE-API.md`).

**Must never contain:**
- layout parsing or rendering (the web runtime draws the board; the shell draws nothing),
- board or settings state of any kind,
- a pairing UI (the runtime renders its own claim code + QR on first run),
- any secret store beyond the device identity the runtime itself keeps in the WebView's `localStorage` (DOM storage),
- analytics or any phone-home, or any network call to anything that isn't your GlanceOS server.

## Project layout

```
androidtv/
  settings.gradle.kts
  build.gradle.kts              root: AGP + Kotlin plugin versions
  gradle.properties             AndroidX on
  gradlew / gradlew.bat         wrapper scripts (jar committed — ./gradlew works with no system Gradle)
  gradle/wrapper/gradle-wrapper.properties
  app/
    build.gradle.kts            module: applicationId, SDK levels, GLANCEOS_URL BuildConfig
    src/main/AndroidManifest.xml  leanback launcher, INTERNET, landscape
    src/main/java/com/glanceos/tv/MainActivity.kt   the whole app
    src/main/res/values/strings.xml      app_name = "GlanceOS TV"
    src/main/res/values/themes.xml       fullscreen no-action-bar theme
    src/main/res/drawable/               placeholder banner + adaptive-icon vectors
    src/main/res/mipmap*/ic_launcher*    placeholder launcher icon
```

## Prerequisites

- **JDK 17** (Android Gradle Plugin 8.5 needs Java 17–21; a newer JDK like 24 will be rejected). On macOS: `brew install --cask temurin@17`.
- The **Android SDK** — *either* Android Studio (easiest, also gives you `adb` and a click-to-build), *or* the command-line tools (`sdkmanager`) with platform `android-34` + build-tools 34.x. Headless setup:
  ```
  brew install --cask android-commandlinetools
  sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
  yes | sdkmanager --licenses
  export ANDROID_HOME="$(brew --prefix)/share/android-commandlinetools"   # so Gradle finds the SDK
  ```
  `adb` is in `$ANDROID_HOME/platform-tools` (or `brew install android-platform-tools`).
- The Fire TV stick / Android TV and your computer on the **same LAN**, with the device set to allow ADB ("Developer options → ADB debugging" + "Apps from Unknown Sources").

The **Gradle wrapper jar is committed**, so `./gradlew` works with just a JDK + the SDK — **no Android Studio and no system Gradle required**. (The wrapper downloads Gradle 8.7 itself on first run.)

## Set the host

The host URL is a **build-time** constant. Open `app/build.gradle.kts` and change the placeholder in `defaultConfig`:

```
buildConfigField("String", "GLANCEOS_URL", "\"http://glanceos.local:8080\"")
```

Replace `http://glanceos.local:8080` with your server's LAN address, for example `http://192.168.1.50:8080`. Keep the escaped quotes. It must never be a real public domain — this is a self-hosted, LAN-only screen.

(The manifest sets `usesCleartextTraffic="true"` because the server is plain HTTP on the LAN by design. If you front your server with HTTPS, point `GLANCEOS_URL` at `https://...` and you can drop that attribute.)

## Build

A debug APK, ready to sideload:

```
cd devices/androidtv
./gradlew assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`.

## Sideload to a Fire TV stick / Android TV

1. Find the device IP: on Fire TV, *Settings → My Fire TV → About → Network*; on Android TV, *Settings → Network → (your network)*.
2. Connect ADB over the network and install:

```
adb connect <device-ip>:5555
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

3. Launch it from the device's home row (the app appears as **GlanceOS TV**), or kick it off from your computer:

```
adb shell monkey -p com.glanceos.tv -c android.intent.category.LEANBACK_LAUNCHER 1
```

On first run the screen shows a big QR + a short claim code — scan/enter it in the GlanceOS config app to bind the screen. The shell does nothing for pairing.

To update later, rebuild and `adb install -r ...` again (the `-r` reinstalls in place).

### Fire TV vs Android TV

- **Fire TV** (Amazon): manufacturer reports `Amazon`, so the shell sends `platform=firetv`. Fire TV's launcher reads the same leanback intent + `android:banner`; sideloaded apps appear under *Your Apps & Channels*. Fire OS is based on older Android, so `minSdk 21` is intentional (covers Fire TV gen-2 and up).
- **Android TV / Google TV**: any other manufacturer reports `platform=androidtv`. The leanback launcher tile and D-pad behavior are the same.

Both deliver standard `KeyboardEvent.key` values from the remote to the page, which is all the web runtime needs.

## Assets (placeholders — swap your own)

The repo ships **vector** placeholders so the build is green with no binaries:

- `res/drawable/banner.xml` — the TV launcher tile. Replace with a real **320×180 PNG** at `res/drawable-xhdpi/banner.png` (a PNG at the same resource name overrides the vector). The manifest references `@drawable/banner`.
- `res/mipmap*/ic_launcher*` + `res/drawable/ic_launcher_foreground.xml` / `ic_launcher_background.xml` — the launcher icon. For crisp per-density icons, use Android Studio's *Image Asset* wizard (right-click `res` → *New → Image Asset*) to generate proper `mipmap-*dpi` PNGs.

These are placeholders only — no binary assets are authored here.

## Caveats

- `assembleDebug` produces an **unsigned-for-distribution, debug-signed** APK — fine for personal sideloading to your own stick, not for any store. A real release build (`assembleRelease`) needs **your own keystore**; create one with `keytool -genkeypair -v -keystore glanceos-release.jks -alias glanceos -keyalg RSA -keysize 2048 -validity 10000` and wire it into a `signingConfigs` block (kept out of git — see `.gitignore`).
- The `gradle-wrapper.jar` (Gradle 8.7, the official one) **is committed**, so `./gradlew assembleDebug` works with no Android Studio and no system Gradle — just a JDK 17 + the SDK.
- Old Fire TV WebViews are old Chromiums; the GlanceOS runtime already targets `es2017` for exactly this reason, so it runs fine — but very old sticks can be sluggish on heavy boards.
- This app has not been built or installed on hardware from the authoring environment (no Android toolchain there). The sources are complete and conventional; supply real banner/icon art before it looks finished on the home row.
