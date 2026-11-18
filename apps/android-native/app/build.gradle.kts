// Sadaqa Jaria — Android app module (Phase 5).
// Data layer: the EXACT sadaqa.db via androidx.sqlite:sqlite-bundled
// (bundled SQLite with guaranteed FTS5 — the app never depends on the
// device's system SQLite, per ARCHITECTURE §3). All queries parameter-bound.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "app.sadaqa.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.sadaqa.android"
        minSdk = 26            // java.time (HijrahDate umalqura) is native
        targetSdk = 35
        versionCode = 4
        versionName = "2.0.3"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")

    // bundled SQLite (FTS5 guaranteed) — the same engine family the web
    // ships; opened directly on the copied sadaqa.db.
    implementation("androidx.sqlite:sqlite-bundled:2.5.2")

    // prayer engine (DateComponents civil-date API = deterministic parity)
    implementation("com.batoulapps.adhan:adhan:1.2.1")

    // JSON (runtime + JVM parity tests)
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Glance widgets (prayer countdown + daily dhikr)
    implementation("androidx.glance:glance-appwidget:1.1.1")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    // Force the KMP JVM sqlite-bundled artifact (embeds host native libsqliteJni)
    // instead of the Android AAR stub on JVM unit test classpaths.
    testImplementation("androidx.sqlite:sqlite-bundled-jvm:2.5.2")
    testImplementation("androidx.sqlite:sqlite-jvm:2.5.2")
    testImplementation("com.batoulapps.adhan:adhan:1.2.1")

    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation(composeBom)
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-tooling")
}

configurations.matching { it.name.contains("UnitTest") }.configureEach {
    exclude(group = "androidx.sqlite", module = "sqlite-bundled-android")
    exclude(group = "androidx.sqlite", module = "sqlite-android")
}
