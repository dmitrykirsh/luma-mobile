import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// ключ подписи релиза лежит в keystore.properties (в репозиторий не попадает); без него релиз подписывается отладочным ключом
val ksProps = Properties().apply { val f = rootProject.file("keystore.properties"); if (f.exists()) f.inputStream().use { load(it) } }
// OAuth-клиент Google для синхронизации через Drive — общий файл вне репозиториев (D:\lift\sync-credentials.local.properties)
val syncProps = Properties().apply { val f = rootProject.file("../sync-credentials.local.properties"); if (f.exists()) f.inputStream().use { load(it) } }

android {
    namespace = "ws.luma.mobile"
    compileSdk = 34
    buildFeatures { buildConfig = true }
    defaultConfig {
        applicationId = "ws.luma.mobile"
        minSdk = 24
        targetSdk = 34
        versionCode = 6
        versionName = "0.3.2"
        buildConfigField("String", "DRIVE_CLIENT_ID", "\"${syncProps.getProperty("driveClientId", "")}\"")
        buildConfigField("String", "DRIVE_CLIENT_SECRET", "\"${syncProps.getProperty("driveClientSecret", "")}\"")
        buildConfigField("String", "DRIVE_DESK_ID", "\"${syncProps.getProperty("driveDesktopClientId", "")}\"")
        buildConfigField("String", "DRIVE_DESK_SECRET", "\"${syncProps.getProperty("driveDesktopClientSecret", "")}\"")
    }
    signingConfigs {
        if (ksProps.containsKey("storeFile")) create("release") {
            storeFile = rootProject.file(ksProps.getProperty("storeFile"))
            storePassword = ksProps.getProperty("storePassword")
            keyAlias = ksProps.getProperty("keyAlias")
            keyPassword = ksProps.getProperty("keyPassword")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.4.1")
    implementation("androidx.media3:media3-exoplayer-dash:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:okhttp-dnsoverhttps:4.12.0")
}
