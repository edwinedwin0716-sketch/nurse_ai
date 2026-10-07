package com.detox.launcher

import android.content.Context
import java.time.LocalDate

/** 런처의 모든 설정을 SharedPreferences 에 저장한다. */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("detox", Context.MODE_PRIVATE)

    // 홈 화면에 보이는 즐겨찾기 앱 (순서 유지: "|" 로 구분)
    var favorites: List<String>
        get() = sp.getString("favorites", "")!!.split("|").filter { it.isNotBlank() }
        set(v) = sp.edit().putString("favorites", v.joinToString("|")).apply()

    /** 열기 전에 '잠깐 멈춤' 화면을 보여줄 방해 앱 */
    var distracting: Set<String>
        get() = sp.getStringSet("distracting", emptySet())!!.toSet()
        set(v) = sp.edit().putStringSet("distracting", v).apply()

    /** 앱 서랍에서 숨긴 앱 */
    var hidden: Set<String>
        get() = sp.getStringSet("hidden", emptySet())!!.toSet()
        set(v) = sp.edit().putStringSet("hidden", v).apply()

    /** 멈춤 화면 대기 시간 (초) */
    var pauseSeconds: Int
        get() = sp.getInt("pauseSeconds", 10)
        set(v) = sp.edit().putInt("pauseSeconds", v).apply()

    /** 집중 모드 종료 시각 (epoch millis). 0 이면 꺼짐 */
    var focusUntil: Long
        get() = sp.getLong("focusUntil", 0L)
        set(v) = sp.edit().putLong("focusUntil", v).apply()

    /** 하루 전체 화면 사용 목표 (분). 0 이면 없음 */
    var dailyGoalMinutes: Int
        get() = sp.getInt("dailyGoal", 120)
        set(v) = sp.edit().putInt("dailyGoal", v).apply()

    var onboarded: Boolean
        get() = sp.getBoolean("onboarded", false)
        set(v) = sp.edit().putBoolean("onboarded", v).apply()

    fun isFocusActive(now: Long = System.currentTimeMillis()) = focusUntil > now

    /** 앱별 하루 사용 한도 (분). 0 = 제한 없음 */
    fun limitMinutes(pkg: String): Int = sp.getInt("limit_$pkg", 0)
    fun setLimitMinutes(pkg: String, minutes: Int) {
        sp.edit().putInt("limit_$pkg", minutes).apply()
    }

    /** 오늘 이 런처에서 앱을 연 횟수 */
    fun opensToday(pkg: String): Int {
        val key = "opens_${LocalDate.now()}_$pkg"
        return sp.getInt(key, 0)
    }

    fun recordOpen(pkg: String) {
        val today = LocalDate.now().toString()
        val key = "opens_${today}_$pkg"
        val editor = sp.edit()
        // 지난 날짜 기록 정리
        sp.all.keys.filter { it.startsWith("opens_") && !it.startsWith("opens_$today") }
            .forEach { editor.remove(it) }
        editor.putInt(key, sp.getInt(key, 0) + 1).apply()
    }

    /** '그만두기'를 누른 횟수 (참은 횟수) */
    fun resistedToday(): Int = sp.getInt("resisted_${LocalDate.now()}", 0)
    fun recordResisted() {
        val today = LocalDate.now().toString()
        val editor = sp.edit()
        sp.all.keys.filter { it.startsWith("resisted_") && it != "resisted_$today" }
            .forEach { editor.remove(it) }
        editor.putInt("resisted_$today", resistedToday() + 1).apply()
    }
}
