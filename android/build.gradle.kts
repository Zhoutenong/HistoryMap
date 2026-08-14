// HistoryMap Android 工程根构建脚本。
// 版本组合（与本地 Gradle 缓存匹配，可离线构建）：
//   Gradle 8.9 + AGP 8.7.3 + Kotlin 2.0.21 + KSP 2.0.21-1.0.28
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
    id("com.google.devtools.ksp") version "2.0.21-1.0.28" apply false
}
