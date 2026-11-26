// Android-прототип SoundCloud 2: WebView с soundcloud.com, теми же скриптами страницы, что на ПК, и фоновым плеером.
// Сборка: из корня репозитория `npx tsc && node scripts/build-mobile.cjs`, затем `gradle -p mobile/android assembleDebug`
// (Gradle 8.11, JDK 17, Android SDK 35). В CI это делает .github/workflows/android.yml
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "SoundCloud2"
include(":app")
