package com.detox.launcher

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import java.text.Collator
import java.util.Locale

data class AppInfo(
    val label: String,
    val packageName: String,
    val activityName: String,
) {
    val component get() = ComponentName(packageName, activityName)
}

object AppRepository {

    fun loadApps(context: Context): List<AppInfo> {
        val pm = context.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolved = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0L))
        } else {
            @Suppress("DEPRECATION")
            pm.queryIntentActivities(intent, 0)
        }
        val collator = Collator.getInstance(Locale.KOREAN)
        return resolved
            .filter { it.activityInfo.packageName != context.packageName }
            .map {
                AppInfo(
                    label = it.loadLabel(pm).toString().trim(),
                    packageName = it.activityInfo.packageName,
                    activityName = it.activityInfo.name,
                )
            }
            .distinctBy { it.packageName }
            .sortedWith { a, b -> collator.compare(a.label, b.label) }
    }

    fun launch(context: Context, app: AppInfo): Boolean = try {
        val intent = Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .setComponent(app.component)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        context.startActivity(intent)
        true
    } catch (e: Exception) {
        val fallback = context.packageManager.getLaunchIntentForPackage(app.packageName)
        if (fallback != null) {
            context.startActivity(fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } else false
    }
}
