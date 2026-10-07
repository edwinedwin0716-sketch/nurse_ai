package com.detox.launcher

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import com.detox.launcher.ui.DetoxTheme
import com.detox.launcher.ui.DrawerScreen
import com.detox.launcher.ui.GateScreen
import com.detox.launcher.ui.HomeScreen
import com.detox.launcher.ui.OnboardingDialog
import com.detox.launcher.ui.SettingsScreen
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {

    private lateinit var state: LauncherState

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        state = LauncherState(applicationContext)

        setContent {
            DetoxTheme {
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(DetoxTheme.bg)
                ) {
                    BackHandler {
                        when {
                            state.gate != null -> state.gate = null
                            state.screen != Screen.HOME -> state.screen = Screen.HOME
                            // 홈에서는 뒤로가기 무시 (런처)
                        }
                    }

                    AnimatedContent(
                        targetState = state.screen,
                        transitionSpec = { fadeIn() togetherWith fadeOut() },
                        label = "screen",
                    ) { screen ->
                        when (screen) {
                            Screen.HOME -> HomeScreen(state)
                            Screen.DRAWER -> DrawerScreen(state)
                            Screen.SETTINGS -> SettingsScreen(state)
                        }
                    }

                    state.gate?.let { gate ->
                        GateScreen(state, gate)
                    }

                    if (state.showOnboarding) {
                        OnboardingDialog(state)
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    /** 홈 버튼을 다시 누르면 첫 화면으로 */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (Intent.ACTION_MAIN == intent.action) {
            state.gate = null
            state.screen = Screen.HOME
        }
    }

    private fun refresh() {
        state.checkFocusExpired()
        state.hasUsagePermission = UsageHelper.hasPermission(this)
        lifecycleScope.launch {
            val apps = withContext(Dispatchers.Default) { AppRepository.loadApps(applicationContext) }
            state.apps = apps
            val usage = withContext(Dispatchers.Default) { UsageHelper.today(applicationContext) }
            state.usage = usage
        }
    }
}
