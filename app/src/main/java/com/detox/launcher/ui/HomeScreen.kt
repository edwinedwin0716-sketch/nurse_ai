package com.detox.launcher.ui

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.provider.AlarmClock
import android.provider.MediaStore
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.detox.launcher.LauncherState
import com.detox.launcher.Screen
import com.detox.launcher.UsageHelper
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val timeFmt = DateTimeFormatter.ofPattern("HH:mm")
private val dateFmt = DateTimeFormatter.ofPattern("M월 d일 EEEE", Locale.KOREAN)

private val quotes = listOf(
    "지금 이 순간에 머물러 보세요.",
    "휴대폰을 내려놓으면 하루가 길어집니다.",
    "정말 필요한 일인가요?",
    "심심함은 창의력의 시작입니다.",
    "눈을 들어 주변을 보세요.",
    "천천히, 한 번에 하나씩.",
    "오늘 누군가와 눈을 마주치며 대화해 보세요.",
)

@Composable
fun HomeScreen(state: LauncherState) {
    val context = LocalContext.current
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            delay(1_000L)
        }
    }
    val dt = Instant.ofEpochMilli(now).atZone(ZoneId.systemDefault())
    val quote = remember(dt.dayOfYear) { quotes[dt.dayOfYear % quotes.size] }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                var total = 0f
                detectVerticalDragGestures(
                    onDragStart = { total = 0f },
                    onDragEnd = {
                        when {
                            total < -120f -> state.screen = Screen.DRAWER
                            total > 120f -> expandNotifications(context)
                        }
                    },
                ) { _, dy -> total += dy }
            }
            .pointerInput(Unit) {
                detectTapGestures(onLongPress = { state.screen = Screen.SETTINGS })
            }
            .safeDrawingPadding()
            .padding(horizontal = 32.dp, vertical = 24.dp),
    ) {
        // ---- 시계 ----
        Text(
            text = dt.format(timeFmt),
            color = DetoxTheme.fg,
            fontSize = 64.sp,
            fontWeight = FontWeight.Light,
            modifier = Modifier.clickable {
                startSafely(context, Intent(AlarmClock.ACTION_SHOW_ALARMS))
            },
        )
        Text(dt.format(dateFmt), color = DetoxTheme.dim, fontSize = 18.sp)

        Spacer(Modifier.height(20.dp))

        // ---- 오늘의 사용량 ----
        if (state.hasUsagePermission) {
            UsageSummary(state)
        } else {
            Text(
                "사용 시간을 보려면 길게 눌러 설정에서 권한을 허용하세요",
                color = DetoxTheme.dim,
                fontSize = 13.sp,
            )
        }

        // ---- 집중 모드 ----
        if (state.isFocusActive(now)) {
            Spacer(Modifier.height(16.dp))
            val left = (state.focusUntil - now).coerceAtLeast(0L)
            val m = left / 60_000L
            val s = (left / 1000L) % 60
            Text(
                "● 집중 모드  ${m}분 ${s}초 남음",
                color = DetoxTheme.warn,
                fontSize = 15.sp,
            )
        }

        // ---- 즐겨찾기 앱 ----
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            verticalArrangement = Arrangement.Center,
        ) {
            val favs = state.favorites.mapNotNull { state.appByPackage(it) }
            if (favs.isEmpty() && state.apps.isNotEmpty()) {
                Text(
                    "위로 밀어 모든 앱을 열고\n앱을 길게 눌러 홈에 추가하세요",
                    color = DetoxTheme.dim,
                    fontSize = 16.sp,
                    lineHeight = 24.sp,
                )
            }
            favs.forEach { app ->
                val blocked = state.isFocusActive(now) && app.packageName in state.distracting
                Text(
                    text = app.label,
                    color = if (blocked) DetoxTheme.faint else DetoxTheme.fg,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Normal,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { state.requestOpen(app) }
                        .padding(vertical = 10.dp),
                )
            }
        }

        Text(quote, color = DetoxTheme.dim, fontSize = 13.sp)
        Spacer(Modifier.height(16.dp))

        // ---- 하단: 전화 / 모든 앱 / 카메라 ----
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            BottomAction("전화") { startSafely(context, Intent(Intent.ACTION_DIAL)) }
            BottomAction("모든 앱") { state.screen = Screen.DRAWER }
            BottomAction("카메라") {
                startSafely(context, Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA))
            }
        }
    }
}

@Composable
private fun UsageSummary(state: LauncherState) {
    val total = state.usage.totalMs
    val goalMs = state.dailyGoalMinutes * 60_000L
    val over = goalMs > 0 && total > goalMs
    Text(
        buildString {
            append("오늘 화면 ")
            append(UsageHelper.format(total))
            append("  ·  잠금해제 ${state.usage.unlocks}회")
            if (state.resistedToday > 0) append("  ·  참은 횟수 ${state.resistedToday}")
        },
        color = if (over) DetoxTheme.warn else DetoxTheme.dim,
        fontSize = 13.sp,
    )
    if (goalMs > 0) {
        Spacer(Modifier.height(8.dp))
        val ratio = (total.toFloat() / goalMs).coerceIn(0f, 1f)
        Box(
            Modifier
                .fillMaxWidth()
                .height(2.dp)
                .background(DetoxTheme.faint)
        ) {
            Box(
                Modifier
                    .fillMaxWidth(ratio)
                    .height(2.dp)
                    .background(if (over) DetoxTheme.warn else DetoxTheme.fg)
            )
        }
        Spacer(Modifier.height(4.dp))
        Text(
            if (over) "목표 ${UsageHelper.format(goalMs)}을 넘었어요. 잠시 쉬어볼까요?"
            else "하루 목표 ${UsageHelper.format(goalMs)}",
            color = DetoxTheme.dim,
            fontSize = 11.sp,
        )
    }
}

@Composable
private fun BottomAction(text: String, onClick: () -> Unit) {
    Text(
        text = text,
        color = DetoxTheme.dim,
        fontSize = 16.sp,
        modifier = Modifier
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp, horizontal = 4.dp),
    )
}

fun startSafely(context: Context, intent: Intent) {
    try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: Exception) {
    }
}

/** 아래로 밀면 알림창 열기 (공식 API 가 없어 리플렉션 사용) */
@SuppressLint("WrongConstant")
private fun expandNotifications(context: Context) {
    try {
        val sbm = context.getSystemService("statusbar") ?: return
        sbm.javaClass.getMethod("expandNotificationsPanel").invoke(sbm)
    } catch (_: Exception) {
    }
}
