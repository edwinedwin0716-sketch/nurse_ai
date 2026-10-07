package com.detox.launcher

import android.app.NotificationManager
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

enum class Screen { HOME, DRAWER, SETTINGS }

enum class GateMode {
    /** 숨 고르기 후 열 수 있음 */
    PAUSE,
    /** 오늘 한도 초과 */
    LIMIT,
    /** 집중 모드 중 */
    FOCUS,
}

data class Gate(val app: AppInfo, val mode: GateMode)

/** 화면에서 관찰하는 상태. 값이 바뀌면 Compose 가 다시 그린다. */
class LauncherState(private val context: Context) {
    val prefs = Prefs(context)

    var screen by mutableStateOf(Screen.HOME)
    var gate by mutableStateOf<Gate?>(null)

    var apps by mutableStateOf<List<AppInfo>>(emptyList())
    var usage by mutableStateOf(TodayUsage.EMPTY)
    var hasUsagePermission by mutableStateOf(false)

    var favorites by mutableStateOf(prefs.favorites)
        private set
    var distracting by mutableStateOf(prefs.distracting)
        private set
    var hidden by mutableStateOf(prefs.hidden)
        private set
    var focusUntil by mutableLongStateOf(prefs.focusUntil)
        private set
    var pauseSeconds by mutableIntStateOf(prefs.pauseSeconds)
        private set
    var dailyGoalMinutes by mutableIntStateOf(prefs.dailyGoalMinutes)
        private set
    var resistedToday by mutableIntStateOf(prefs.resistedToday())
        private set
    /** 한도가 바뀌면 증가시켜 화면을 다시 그리게 함 */
    var limitsVersion by mutableIntStateOf(0)
        private set
    var showOnboarding by mutableStateOf(!prefs.onboarded)

    fun appByPackage(pkg: String): AppInfo? = apps.firstOrNull { it.packageName == pkg }

    fun isFocusActive(now: Long = System.currentTimeMillis()) = focusUntil > now

    fun limitOf(pkg: String): Int {
        limitsVersion // 상태 읽기 (재구성 트리거)
        return prefs.limitMinutes(pkg)
    }

    fun setLimit(pkg: String, minutes: Int) {
        prefs.setLimitMinutes(pkg, minutes)
        // 한도를 정하면 자동으로 방해 앱으로 취급
        if (minutes > 0 && pkg !in distracting) toggleDistracting(pkg)
        limitsVersion++
    }

    fun toggleFavorite(pkg: String) {
        favorites = if (pkg in favorites) favorites - pkg else (favorites + pkg).take(MAX_FAVORITES)
        prefs.favorites = favorites
    }

    fun moveFavorite(pkg: String, delta: Int) {
        val list = favorites.toMutableList()
        val i = list.indexOf(pkg)
        val j = i + delta
        if (i < 0 || j !in list.indices) return
        list[i] = list[j].also { list[j] = list[i] }
        favorites = list
        prefs.favorites = list
    }

    fun toggleDistracting(pkg: String) {
        distracting = if (pkg in distracting) distracting - pkg else distracting + pkg
        prefs.distracting = distracting
    }

    fun toggleHidden(pkg: String) {
        hidden = if (pkg in hidden) hidden - pkg else hidden + pkg
        prefs.hidden = hidden
    }

    fun updatePauseSeconds(sec: Int) {
        pauseSeconds = sec
        prefs.pauseSeconds = sec
    }

    fun updateDailyGoal(min: Int) {
        dailyGoalMinutes = min
        prefs.dailyGoalMinutes = min
    }

    fun recordResisted() {
        prefs.recordResisted()
        resistedToday = prefs.resistedToday()
    }

    fun finishOnboarding() {
        prefs.onboarded = true
        showOnboarding = false
    }

    // ---------- 집중 모드 ----------

    fun startFocus(minutes: Int) {
        focusUntil = System.currentTimeMillis() + minutes * 60_000L
        prefs.focusUntil = focusUntil
        val nm = context.getSystemService(NotificationManager::class.java)
        if (nm.isNotificationPolicyAccessGranted) {
            nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
            context.getSharedPreferences("detox", Context.MODE_PRIVATE)
                .edit().putBoolean("dndByUs", true).apply()
        }
    }

    fun stopFocus() {
        focusUntil = 0L
        prefs.focusUntil = 0L
        restoreDndIfNeeded()
    }

    /** 집중 모드가 끝났는데 우리가 켠 방해 금지가 남아 있으면 끔 */
    fun checkFocusExpired() {
        if (focusUntil != 0L && !isFocusActive()) stopFocus()
    }

    private fun restoreDndIfNeeded() {
        val sp = context.getSharedPreferences("detox", Context.MODE_PRIVATE)
        if (!sp.getBoolean("dndByUs", false)) return
        val nm = context.getSystemService(NotificationManager::class.java)
        if (nm.isNotificationPolicyAccessGranted) {
            nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL)
        }
        sp.edit().putBoolean("dndByUs", false).apply()
    }

    // ---------- 앱 열기 ----------

    /** 앱을 바로 열지, 멈춤/차단 화면을 먼저 보여줄지 결정 */
    fun requestOpen(app: AppInfo) {
        val pkg = app.packageName
        val limit = prefs.limitMinutes(pkg)
        gate = when {
            isFocusActive() && pkg in distracting -> Gate(app, GateMode.FOCUS)
            limit > 0 && usage.minutes(pkg) >= limit -> Gate(app, GateMode.LIMIT)
            pkg in distracting -> Gate(app, GateMode.PAUSE)
            else -> {
                openNow(app)
                null
            }
        }
    }

    fun openNow(app: AppInfo) {
        prefs.recordOpen(app.packageName)
        gate = null
        AppRepository.launch(context, app)
        screen = Screen.HOME
    }

    companion object {
        const val MAX_FAVORITES = 8
    }
}
