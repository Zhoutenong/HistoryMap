plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.historymap.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.historymap.app"
        // minSdk 24（Android 7.0，GLES2/Compose 下限）；实测真机 P20 为 API 28
        minSdk = 24
        targetSdk = 34
        versionCode = 2
        versionName = "2.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    // Room：事件/朝代数据层，schema 对齐 server/data/schema.sql，
    // seed 数据在首次建库时从 assets/seed/*.sql 重放（与 server/db.js 同一份 SQL）
    implementation("androidx.room:room-runtime:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    // Compose UI：时间轴/事件流/详情/设置/图例等界面层
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose")

    // JVM 单元测试（纯逻辑：投影 / 尺寸换算 / 碰撞 / 摘要 / overlay 解析 fallback）
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20180813")
}
