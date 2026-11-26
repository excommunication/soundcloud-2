plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Версия прототипа следует за версией клиента на ПК из package.json
val clientVersion: String = Regex("\"version\"\\s*:\\s*\"([^\"]+)\"")
    .find(rootDir.resolve("../../package.json").readText())?.groupValues?.get(1) ?: "0.0.0"

android {
    namespace = "io.github.sc2.mobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.zxczxczxczxczxczxc1111.soundcloud.mobile"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "$clientVersion-android-prototype"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.media:media:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
}
