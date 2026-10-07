package com.detox.launcher.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.detox.launcher.Gate
import com.detox.launcher.GateMode
import com.detox.launcher.LauncherState
import kotlinx.coroutines.delay

/**
 * 방해 앱을 열기 전에 보여주는 화면.
 * - PAUSE: 숨을 고르며 N초 기다린 뒤에만 열 수 있음
 * - LIMIT: 오늘 한도를 다 써서 열 수 없음
 * - FOCUS: 집중 모드 중이라 열 수 없음
 */
@Composable
fun GateScreen(state: LauncherState, gate: Gate) {
    val app = gate.app
    val pkg = app.packageName
    var remaining by remember(gate) { mutableIntStateOf(state.pauseSeconds) }
    LaunchedEffect(gate) {
        while (remaining > 0) {
            delay(1_000L)
            remaining--
        }
    }

    val transition = rememberInfiniteTransition(label = "breath")
    // 4초 들이쉬고 4초 내쉬기
    val scale by transition.animateFloat(
        initialValue = 0.55f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(4_000, easing = LinearEasing), RepeatMode.Reverse),
        label = "scale",
    )
    val breathingIn = remember(gate) { mutableIntStateOf(0) }
    LaunchedEffect(gate) {
        while (true) {
            delay(4_000L)
            breathingIn.intValue = 1 - breathingIn.intValue
        }
    }

    val usedMin = state.usage.minutes(pkg)
    val limit = state.limitOf(pkg)
    val opens = state.prefs.opensToday(pkg)

    Box(
        Modifier
            .fillMaxSize()
            .background(DetoxTheme.bg)
            // 뒤에 있는 화면이 눌리지 않도록 터치 소비
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
            .safeDrawingPadding()
            .padding(32.dp),
    ) {
        Column(
            Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(app.label, color = DetoxTheme.fg, fontSize = 26.sp)
            Spacer(Modifier.height(8.dp))
            Text(
                buildString {
                    append("오늘 ${opens}번 열었어요")
                    if (state.hasUsagePermission) append(" · ${usedMin}분 사용")
                    if (limit > 0) append(" / 한도 ${limit}분")
                },
                color = DetoxTheme.dim,
                fontSize = 14.sp,
            )

            Spacer(Modifier.height(48.dp))

            when (gate.mode) {
                GateMode.PAUSE -> {
                    Box(Modifier.size(200.dp), contentAlignment = Alignment.Center) {
                        Canvas(Modifier.size(200.dp)) {
                            drawCircle(
                                color = DetoxTheme.faint,
                                radius = size.minDimension / 2f,
                                style = Stroke(width = 2f),
                            )
                            drawCircle(
                                color = DetoxTheme.fg.copy(alpha = 0.15f),
                                radius = size.minDimension / 2f * scale,
                            )
                        }
                        Text(
                            if (remaining > 0) "$remaining" else "",
                            color = DetoxTheme.fg,
                            fontSize = 40.sp,
                        )
                    }
                    Spacer(Modifier.height(24.dp))
                    Text(
                        if (breathingIn.intValue == 0) "숨을 들이쉬세요" else "천천히 내쉬세요",
                        color = DetoxTheme.dim,
                        fontSize = 16.sp,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "지금 이 앱을 여는 이유가 무엇인가요?",
                        color = DetoxTheme.fg,
                        fontSize = 18.sp,
                        textAlign = TextAlign.Center,
                    )
                }

                GateMode.LIMIT -> {
                    Text(
                        "오늘의 사용 한도(${limit}분)를\n모두 사용했어요.",
                        color = DetoxTheme.fg,
                        fontSize = 22.sp,
                        textAlign = TextAlign.Center,
                        lineHeight = 32.sp,
                    )
                    Spacer(Modifier.height(16.dp))
                    Text("내일 다시 만나요.", color = DetoxTheme.dim, fontSize = 16.sp)
                }

                GateMode.FOCUS -> {
                    val leftMin = ((state.focusUntil - System.currentTimeMillis()) / 60_000L) + 1
                    Text(
                        "집중 모드 중이에요.",
                        color = DetoxTheme.fg,
                        fontSize = 22.sp,
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        "약 ${leftMin}분 뒤에 열 수 있어요.",
                        color = DetoxTheme.dim,
                        fontSize = 16.sp,
                    )
                }
            }

            Spacer(Modifier.height(56.dp))

            OutlinedButton(
                onClick = {
                    state.recordResisted()
                    state.gate = null
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("그만두기", color = DetoxTheme.fg, fontSize = 18.sp)
            }

            if (gate.mode == GateMode.PAUSE) {
                Spacer(Modifier.height(8.dp))
                TextButton(
                    onClick = { state.openNow(app) },
                    enabled = remaining == 0,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        if (remaining > 0) "${remaining}초 후에 열 수 있어요" else "그래도 열기",
                        color = if (remaining > 0) DetoxTheme.faint else DetoxTheme.dim,
                    )
                }
            }
        }
    }
}
