package com.detox.launcher.ui

import android.app.NotificationManager
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.detox.launcher.AppInfo
import com.detox.launcher.LauncherState
import com.detox.launcher.Screen
import com.detox.launcher.UsageHelper

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(state: LauncherState) {
    val context = LocalContext.current
    var editApp by remember { mutableStateOf<AppInfo?>(null) }
    var confirmStopFocus by remember { mutableStateOf(false) }
    val roleLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { }

    // state.usage 가 onResume 마다 갱신되므로, 이를 읽어 권한 상태도 함께 다시 계산
    @Suppress("UNUSED_VARIABLE") val refreshKey = state.usage
    val isDefaultHome = isDefaultHome(context)
    val dndGranted = context.getSystemService(NotificationManager::class.java)
        .isNotificationPolicyAccessGranted

    Column(
        Modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("설정", color = DetoxTheme.fg, fontSize = 30.sp, modifier = Modifier.weight(1f))
            TextButton(onClick = { state.screen = Screen.HOME }) {
                Text("완료", color = DetoxTheme.dim)
            }
        }

        // ---------- 기본 설정 ----------
        Section("시작하기")
        StatusRow(
            title = "기본 홈 앱",
            status = if (isDefaultHome) "설정됨" else "설정 필요",
            ok = isDefaultHome,
        ) {
            val rm = context.getSystemService(RoleManager::class.java)
            if (!isDefaultHome && rm.isRoleAvailable(RoleManager.ROLE_HOME)) {
                try {
                    roleLauncher.launch(rm.createRequestRoleIntent(RoleManager.ROLE_HOME))
                    return@StatusRow
                } catch (_: Exception) {
                }
            }
            startSafely(context, Intent(Settings.ACTION_HOME_SETTINGS))
        }
        StatusRow(
            title = "사용 정보 접근 (화면 시간·한도)",
            status = if (state.hasUsagePermission) "허용됨" else "허용 필요",
            ok = state.hasUsagePermission,
        ) { startSafely(context, UsageHelper.permissionIntent(context)) }
        StatusRow(
            title = "방해 금지 제어 (집중 모드용)",
            status = if (dndGranted) "허용됨" else "선택",
            ok = dndGranted,
        ) { startSafely(context, Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)) }

        // ---------- 집중 모드 ----------
        Section("집중 모드")
        Hint("켜는 동안 방해 앱은 열 수 없어요." + if (dndGranted) " 방해 금지 모드도 함께 켜져요." else "")
        if (state.isFocusActive()) {
            val left = (state.focusUntil - System.currentTimeMillis()) / 60_000L + 1
            Text("집중 중 · 약 ${left}분 남음", color = DetoxTheme.warn, fontSize = 16.sp)
            TextButton(onClick = { confirmStopFocus = true }) {
                Text("집중 모드 끝내기", color = DetoxTheme.dim)
            }
        } else {
            FlowRow {
                listOf(25, 50, 90, 120, 240).forEach { min ->
                    Chip(if (min < 60) "${min}분" else "${min / 60}시간" + if (min % 60 > 0) " ${min % 60}분" else "", false) {
                        state.startFocus(min)
                        state.screen = Screen.HOME
                    }
                }
            }
        }

        // ---------- 멈춤 시간 ----------
        Section("열기 전 멈춤 시간")
        Hint("방해 앱을 열 때 숨을 고르며 기다리는 시간이에요.")
        FlowRow {
            listOf(5, 10, 20, 30, 60).forEach { sec ->
                Chip("${sec}초", state.pauseSeconds == sec) { state.updatePauseSeconds(sec) }
            }
        }

        // ---------- 하루 목표 ----------
        Section("하루 화면 시간 목표")
        FlowRow {
            listOf(0, 60, 120, 180, 240).forEach { min ->
                Chip(if (min == 0) "없음" else "${min / 60}시간", state.dailyGoalMinutes == min) {
                    state.updateDailyGoal(min)
                }
            }
        }

        // ---------- 흑백 화면 ----------
        Section("흑백 화면")
        Hint("화면을 회색으로 바꾸면 휴대폰이 덜 매력적으로 느껴져요.\n접근성 → 색상 및 움직임 → 색상 보정 → 회색조 를 켜세요.\n(또는 디지털 웰빙 → 취침 모드 → 회색조)")
        TextButton(onClick = { startSafely(context, Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }) {
            Text("접근성 설정 열기", color = DetoxTheme.fg)
        }

        // ---------- 오늘 사용 순위 ----------
        if (state.hasUsagePermission) {
            Section("오늘 많이 쓴 앱")
            val top = state.usage.perApp.entries
                .sortedByDescending { it.value }
                .filter { it.value >= 60_000L }
                .take(10)
            if (top.isEmpty()) Hint("아직 기록이 없어요.")
            top.forEach { (pkg, ms) ->
                val label = state.appByPackage(pkg)?.label ?: pkg
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { state.appByPackage(pkg)?.let { editApp = it } }
                        .padding(vertical = 8.dp),
                ) {
                    Text(
                        label,
                        color = DetoxTheme.fg,
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(UsageHelper.format(ms), color = DetoxTheme.dim)
                }
            }
        }

        // ---------- 홈 즐겨찾기 순서 ----------
        Section("홈 화면 앱 (최대 ${LauncherState.MAX_FAVORITES}개)")
        if (state.favorites.isEmpty()) Hint("모든 앱에서 앱을 길게 눌러 추가하세요.")
        state.favorites.forEach { pkg ->
            val label = state.appByPackage(pkg)?.label ?: pkg
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(label, color = DetoxTheme.fg, modifier = Modifier.weight(1f), maxLines = 1)
                TextButton(onClick = { state.moveFavorite(pkg, -1) }) { Text("▲", color = DetoxTheme.dim) }
                TextButton(onClick = { state.moveFavorite(pkg, 1) }) { Text("▼", color = DetoxTheme.dim) }
                TextButton(onClick = { state.toggleFavorite(pkg) }) { Text("제거", color = DetoxTheme.dim) }
            }
        }

        // ---------- 방해 앱 ----------
        Section("방해 앱")
        if (state.distracting.isEmpty()) Hint("SNS·동영상·게임 앱을 길게 눌러 방해 앱으로 지정하세요.")
        state.distracting.mapNotNull { state.appByPackage(it) }.sortedBy { it.label }.forEach { app ->
            val limit = state.limitOf(app.packageName)
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable { editApp = app }
                    .padding(vertical = 10.dp),
            ) {
                Text(app.label, color = DetoxTheme.fg, modifier = Modifier.weight(1f), maxLines = 1)
                Text(
                    if (limit > 0) "하루 ${limit}분" else "멈춤만",
                    color = DetoxTheme.dim,
                )
            }
        }

        // ---------- 숨긴 앱 ----------
        if (state.hidden.isNotEmpty()) {
            Section("숨긴 앱")
            state.hidden.mapNotNull { state.appByPackage(it) }.sortedBy { it.label }.forEach { app ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(app.label, color = DetoxTheme.fg, modifier = Modifier.weight(1f), maxLines = 1)
                    TextButton(onClick = { state.toggleHidden(app.packageName) }) {
                        Text("숨김 해제", color = DetoxTheme.dim)
                    }
                }
            }
        }

        Section("사용법")
        Hint(
            "· 홈에서 위로 밀기: 모든 앱\n" +
                "· 홈에서 아래로 밀기: 알림창\n" +
                "· 홈 길게 누르기: 설정\n" +
                "· 시계 누르기: 알람\n" +
                "· 앱 길게 누르기: 홈 추가 / 방해 앱 / 시간 제한 / 숨기기"
        )
        Spacer(Modifier.height(48.dp))
    }

    editApp?.let { app -> AppOptionsDialog(state, app) { editApp = null } }

    if (confirmStopFocus) {
        AlertDialog(
            onDismissRequest = { confirmStopFocus = false },
            containerColor = DetoxTheme.surface,
            title = { Text("정말 그만둘까요?", color = DetoxTheme.fg) },
            text = { Text("조금만 더 버텨 보는 건 어때요?", color = DetoxTheme.dim) },
            confirmButton = {
                TextButton(onClick = { confirmStopFocus = false }) {
                    Text("계속 집중하기", color = DetoxTheme.fg)
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    state.stopFocus()
                    confirmStopFocus = false
                }) { Text("끝내기", color = DetoxTheme.dim) }
            },
        )
    }
}

@Composable
private fun Section(title: String) {
    Spacer(Modifier.height(28.dp))
    HorizontalDivider(color = DetoxTheme.faint)
    Spacer(Modifier.height(16.dp))
    Text(title, color = DetoxTheme.fg, fontSize = 18.sp)
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun Hint(text: String) {
    Text(text, color = DetoxTheme.dim, fontSize = 13.sp, lineHeight = 20.sp)
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun StatusRow(title: String, status: String, ok: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
    ) {
        Text(title, color = DetoxTheme.fg, modifier = Modifier.weight(1f))
        Text(status, color = if (ok) DetoxTheme.dim else DetoxTheme.warn)
    }
}

fun isDefaultHome(context: Context): Boolean {
    val rm = context.getSystemService(RoleManager::class.java)
    return rm.isRoleAvailable(RoleManager.ROLE_HOME) && rm.isRoleHeld(RoleManager.ROLE_HOME)
}
