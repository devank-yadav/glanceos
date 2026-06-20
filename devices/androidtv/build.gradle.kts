// Root build file. The Android Gradle Plugin + Kotlin versions live here so the
// app module just applies them. Versions kept current-but-boring on purpose:
// old Fire TV sticks ship old WebViews, but the build tooling can be modern.
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
