plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.glanceos.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.glanceos.tv"
        minSdk = 21          // Fire TV gen-2+ / Android TV (Lollipop)
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"

        // The ONLY thing you must change before building: point this at your own
        // self-hosted GlanceOS server. The shell loads <GLANCEOS_URL>/screen/?tv=1
        // and the web runtime draws everything. Placeholder on purpose — never a
        // real domain. Examples: "http://glanceos.local:8080" or "http://192.168.1.50:8080".
        buildConfigField("String", "GLANCEOS_URL", "\"http://glanceos.local:8080\"")
    }

    buildTypes {
        debug {
            // Personal sideload build — no minify, no shrink. See README caveats.
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = false
            // A real release needs your OWN keystore (see README). Debug-signed
            // by default so 'gradlew assembleDebug' just works for sideloading.
        }
    }

    buildFeatures {
        // We read BuildConfig.GLANCEOS_URL / VERSION_NAME at runtime.
        buildConfig = true
        // No Compose, no data binding, no view binding. Thin glass.
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    // Deliberately minimal. AppCompat gives us a no-title-bar activity base that
    // behaves the same across the wide spread of Fire TV / Android TV OS versions.
    implementation("androidx.appcompat:appcompat:1.6.1")
}
