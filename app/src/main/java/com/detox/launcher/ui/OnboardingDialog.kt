package com.detox.launcher.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.sp
import com.detox.launcher.LauncherState
import com.detox.launcher.Screen

@Composable
fun OnboardingDialog(state: LauncherState) {
    AlertDialog(
        onDismissRequest = { },
        containerColor = DetoxTheme.surface,
        title = { Text("디톡스 런처에 오신 걸 환영해요", color = DetoxTheme.fg) },
        text = {
            Text(
                "휴대폰을 덜, 더 의식적으로 쓰도록 돕는 홈 화면이에요.\n\n" +
                    "1. 기본 홈 앱으로 설정하기\n" +
                    "2. 사용 정보 접근 허용하기 (화면 시간)\n" +
                    "3. 꼭 필요한 앱만 홈에 추가하기\n" +
                    "4. SNS·동영상 앱은 '방해 앱'으로 지정하기\n\n" +
                    "방해 앱은 열기 전에 잠깐 숨을 고르게 하고,\n" +
                    "하루 한도를 넘거나 집중 모드 중에는 열리지 않아요.",
                color = DetoxTheme.dim,
                fontSize = 14.sp,
                lineHeight = 21.sp,
            )
        },
        confirmButton = {
            TextButton(onClick = {
                state.finishOnboarding()
                state.screen = Screen.SETTINGS
            }) { Text("설정하러 가기", color = DetoxTheme.fg) }
        },
        dismissButton = {
            TextButton(onClick = { state.finishOnboarding() }) {
                Text("나중에", color = DetoxTheme.dim)
            }
        },
    )
}
