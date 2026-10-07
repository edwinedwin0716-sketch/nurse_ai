package com.detox.launcher.ui

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.detox.launcher.AppInfo
import com.detox.launcher.LauncherState
import com.detox.launcher.Screen

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun DrawerScreen(state: LauncherState) {
    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<AppInfo?>(null) }

    val visible = remember(state.apps, state.hidden, query) {
        val q = query.trim()
        state.apps.filter { app ->
            if (q.isEmpty()) app.packageName !in state.hidden
            else app.label.contains(q, ignoreCase = true)
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .imePadding()
            .padding(horizontal = 24.dp),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(top = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("앱 검색", color = DetoxTheme.dim) },
                singleLine = true,
                modifier = Modifier.weight(1f),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = {
                    visible.firstOrNull()?.let { state.requestOpen(it) }
                }),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = DetoxTheme.dim,
                    unfocusedBorderColor = DetoxTheme.faint,
                    cursorColor = DetoxTheme.fg,
                ),
            )
            TextButton(onClick = { state.screen = Screen.SETTINGS }) {
                Text("설정", color = DetoxTheme.dim)
            }
        }

        Spacer(Modifier.height(8.dp))
        Text(
            "길게 누르면 홈 추가 · 방해 앱 지정 · 시간 제한",
            color = DetoxTheme.faint,
            fontSize = 12.sp,
        )

        LazyColumn(Modifier.weight(1f)) {
            items(visible, key = { it.packageName }) { app ->
                val minutes = state.usage.minutes(app.packageName)
                val isDistracting = app.packageName in state.distracting
                Row(
                    Modifier
                        .fillMaxWidth()
                        .combinedClickable(
                            onClick = { state.requestOpen(app) },
                            onLongClick = { selected = app },
                        )
                        .padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        app.label,
                        color = if (isDistracting) DetoxTheme.dim else DetoxTheme.fg,
                        fontSize = 20.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    if (isDistracting) {
                        Text("⏸ ", color = DetoxTheme.dim, fontSize = 12.sp)
                    }
                    if (minutes > 0) {
                        Text("${minutes}분", color = DetoxTheme.dim, fontSize = 12.sp)
                    }
                }
            }
        }
    }

    selected?.let { app ->
        AppOptionsDialog(state, app) { selected = null }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AppOptionsDialog(state: LauncherState, app: AppInfo, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val pkg = app.packageName
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = DetoxTheme.surface,
        title = { Text(app.label, color = DetoxTheme.fg) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                OptionRow(if (pkg in state.favorites) "홈에서 제거" else "홈에 추가") {
                    state.toggleFavorite(pkg)
                }
                OptionRow(
                    if (pkg in state.distracting) "방해 앱 해제" else "방해 앱으로 지정 (열기 전 잠깐 멈춤)"
                ) { state.toggleDistracting(pkg) }
                OptionRow(if (pkg in state.hidden) "숨김 해제" else "목록에서 숨기기") {
                    state.toggleHidden(pkg)
                }
                OptionRow("앱 정보 / 삭제") {
                    startSafely(
                        context,
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg")),
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text("하루 사용 한도", color = DetoxTheme.dim, fontSize = 13.sp)
                Spacer(Modifier.height(6.dp))
                val current = state.limitOf(pkg)
                FlowRow {
                    listOf(0, 15, 30, 60, 90).forEach { min ->
                        Chip(if (min == 0) "없음" else "${min}분", current == min) {
                            state.setLimit(pkg, min)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("닫기", color = DetoxTheme.fg) }
        },
    )
}

@Composable
private fun OptionRow(text: String, onClick: () -> Unit) {
    TextButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Text(text, color = DetoxTheme.fg, modifier = Modifier.fillMaxWidth(), fontSize = 16.sp)
    }
}
