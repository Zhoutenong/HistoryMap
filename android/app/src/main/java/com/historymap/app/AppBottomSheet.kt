package com.historymap.app

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * 应用内底部抽屉（替代 ModalBottomSheet）。
 *
 * ModalBottomSheet 是独立 Dialog 窗口：华为等系统在新窗口弹出时会重置系统栏
 * 可见性（状态栏/导航栏闪现后又被 KeepImmersive 压回，肉眼可见闪烁）。
 * 本组件为纯应用内布局（不创建新 window），系统栏全程保持沉浸，杜绝闪现。
 *
 * 提供：半透明 scrim（点击关闭）、入场/退场动画（AnimatedVisibility 真实播放，
 * 退场经 delay 后再移除父状态）、顶部拖拽条（下滑关闭，可带右上角关闭按钮）。
 * 返回键由 MapScreen 统一 sheet 状态栈控制（详情→设置→事件流→菜单→退出），
 * 本组件不再注册局部 BackHandler，避免依赖多个局部 BackHandler 的组合顺序。
 */
@Composable
fun AppBottomSheet(
    onDismiss: () -> Unit,
    onClose: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    var visible by remember { mutableStateOf(false) }
    var dismissed by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { visible = true }
    // 按窗口高度动态限高/阈值（取代固定 900dp / 140*density）：横屏小高度、
    // 竖屏大高度均自适应，详情最后一项不被导航栏遮挡
    val configuration = androidx.compose.ui.platform.LocalConfiguration.current
    val density = LocalDensity.current.density
    val maxSheetH = (configuration.screenHeightDp * 0.88f).dp
    val dragThresholdPx = configuration.screenHeightDp * density * 0.20f

    fun requestDismiss() {
        if (dismissed) return
        dismissed = true
        visible = false
        scope.launch {
            delay(220) // 等退场动画播完再真正移除父状态
            onDismiss()
        }
    }

    // 退场动画：slideOut + fadeOut（AnimatedVisibility 会保留内容直到动画结束，
    // 再由 delay 后的 onDismiss 移除父状态，修复旧版退场动画没有真正播放的问题）
    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(tween(220)) { it } + fadeIn(tween(220)),
        exit = slideOutVertically(tween(180)) { it } + fadeOut(tween(180)),
    ) {
        Box(Modifier.fillMaxSize()) {
            // scrim（拦截主界面交互；点击关闭）
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color(0x59000000))
                    .pointerInput(Unit) { detectTapGestures { requestDismiss() } },
            )
            // 面板（跟随拖拽条位移；普通状态避免每帧协程竞争）
            var dragY by remember { mutableStateOf(0f) }
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .heightIn(max = maxSheetH)
                    .offset { IntOffset(0, dragY.roundToInt()) },
                color = MapTokens.PAPER_PANEL,
                shape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp),
            ) {
                Column(Modifier.fillMaxWidth()) {
                    // 拖拽条（可拖动区域：下滑超过阈值关闭，否则弹回；右上角可选关闭按钮）
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .draggable(
                                state = rememberDraggableState { delta ->
                                    dragY = (dragY + delta).coerceAtLeast(0f)
                                },
                                orientation = Orientation.Vertical,
                                onDragStopped = {
                                    if (dragY > dragThresholdPx) {
                                        requestDismiss()
                                    } else {
                                        dragY = 0f
                                    }
                                },
                            )
                            .padding(vertical = 10.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        DragHandle()
                        if (onClose != null) {
                            CloseButton(
                                onClose = onClose,
                                modifier = Modifier.align(Alignment.CenterEnd).padding(end = 16.dp),
                            )
                        }
                    }
                    content()
                }
            }
        }
    }
}
