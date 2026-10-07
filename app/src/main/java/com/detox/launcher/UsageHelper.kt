package com.detox.launcher

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Process
import android.provider.Settings
import java.time.LocalDate
import java.time.ZoneId

data class TodayUsage(
    /** 패키지별 오늘 화면 사용 시간 (ms) */
    val perApp: Map<String, Long>,
    /** 잠금 해제 횟수 */
    val unlocks: Int,
) {
    val totalMs: Long get() = perApp.values.sum()
    fun minutes(pkg: String): Int = ((perApp[pkg] ?: 0L) / 60_000L).toInt()

    companion object {
        val EMPTY = TodayUsage(emptyMap(), 0)
    }
}

object UsageHelper {

    fun hasPermission(context: Context): Boolean {
        val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = ops.unsafeCheckOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            context.packageName,
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }

    fun permissionIntent(context: Context): Intent =
        Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            .setData(Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    /** 오늘 0시부터 지금까지의 앱별 포그라운드 시간과 잠금 해제 횟수를 이벤트로 직접 계산 */
    fun today(context: Context): TodayUsage {
        if (!hasPermission(context)) return TodayUsage.EMPTY
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val start = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
        val now = System.currentTimeMillis()

        val events = try {
            usm.queryEvents(start, now)
        } catch (e: Exception) {
            return TodayUsage.EMPTY
        }
        val perApp = HashMap<String, Long>()
        val resumedAt = HashMap<String, Long>()
        var unlocks = 0
        val ev = UsageEvents.Event()
        val self = context.packageName

        while (events.hasNextEvent()) {
            events.getNextEvent(ev)
            val pkg = ev.packageName ?: continue
            when (ev.eventType) {
                UsageEvents.Event.ACTIVITY_RESUMED -> {
                    if (!resumedAt.containsKey(pkg)) resumedAt[pkg] = ev.timeStamp
                }
                UsageEvents.Event.ACTIVITY_PAUSED,
                UsageEvents.Event.ACTIVITY_STOPPED -> {
                    val s = resumedAt.remove(pkg)
                    if (s != null && ev.timeStamp > s) {
                        perApp[pkg] = (perApp[pkg] ?: 0L) + (ev.timeStamp - s)
                    }
                }
                UsageEvents.Event.KEYGUARD_HIDDEN -> unlocks++
                UsageEvents.Event.SCREEN_NON_INTERACTIVE -> {
                    // 화면이 꺼지면 열려 있던 앱 시간 마감
                    resumedAt.forEach { (p, s) ->
                        if (ev.timeStamp > s) perApp[p] = (perApp[p] ?: 0L) + (ev.timeStamp - s)
                    }
                    resumedAt.clear()
                }
            }
        }
        // 아직 열려 있는 앱
        resumedAt.forEach { (p, s) -> if (now > s) perApp[p] = (perApp[p] ?: 0L) + (now - s) }
        // 런처 자신과 시스템 UI 는 제외
        perApp.remove(self)
        perApp.remove("com.android.systemui")
        return TodayUsage(perApp, unlocks)
    }

    fun format(ms: Long): String {
        val totalMin = ms / 60_000L
        val h = totalMin / 60
        val m = totalMin % 60
        return if (h > 0) "${h}시간 ${m}분" else "${m}분"
    }
}
