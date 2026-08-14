package com.historymap.app

import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent

/**
 * 历史地图 Android 原生版入口：Compose 主界面（MapScreen）。
 *
 * 沉浸式全屏说明（P0-1 修复）：
 * - 主题（HistoryMapTheme）已设宣纸 windowBackground + 宣纸 statusBarColor，
 *   onCreate 强制 OPAQUE 窗口格式 + 运行时状态栏/导航栏宣纸色
 *   （EMUI 会把含 SurfaceView 的窗口标记为 TRANSLUCENT，导致窗口背景
 *   不绘制、系统栏区域透出显示器黑色）；
 * - Android 11+：setDecorFitsSystemWindows(false) + insetsController 隐藏
 *   状态栏/导航栏（BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE 轻扫临时露出）；
 * - Android 10 及以下（P20/EMUI10）：只隐藏导航栏，状态栏保持可见——
 *   真机实测本机 SystemUI 将状态栏区域渲染为黑条（含状态图标；设置应用、
 *   桌面 launcher 同样如此），应用侧无法消除，隐藏只会得到无图标的死黑带；
 *   保持可见时至少呈现为正常的系统状态栏形态。布局标志
 *   （LAYOUT_FULLSCREEN / LAYOUT_HIDE_NAVIGATION / LAYOUT_STABLE）保证
 *   内容延伸到系统栏下方，系统栏只叠加、不占布局位。
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 强制窗口不透明：EMUI 会把含 SurfaceView 的窗口标记为 TRANSLUCENT，
        // 此时窗口背景不绘制，可见系统栏透出显示器黑色；恢复 OPAQUE 后
        // 宣纸窗口背景在系统栏区域正常绘制（普通设备上状态栏为宣纸色）
        window.setFormat(android.graphics.PixelFormat.OPAQUE)
        window.setStatusBarColor(android.graphics.Color.rgb(0xE6, 0xD8, 0xB5))
        window.setNavigationBarColor(android.graphics.Color.rgb(0xE6, 0xD8, 0xB5))
        hideSystemBars()
        setContent { MapScreen() }
    }

    /** 沉浸式在窗口获得焦点后需重新应用（P20 上 onCreate 调用可能被系统栏覆盖） */
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    private fun hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11+：内容延伸到刘海区域 + 隐藏系统栏（现代设备无 EMUI10 黑条问题）
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                // 只隐藏导航栏；状态栏保持可见（P20 实测本机 SystemUI 状态栏区域
                // 恒为黑色，隐藏后为无图标的死黑带，保持可见更接近正常系统栏形态）
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    // 布局标志：内容延伸到系统栏下方，系统栏只叠加、不占布局位
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                )
        }
    }
}
