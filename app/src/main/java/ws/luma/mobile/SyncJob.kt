package ws.luma.mobile

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import org.json.JSONArray

/**
 * Фоновая синхронизация: раз в 15 минут, когда телефон в сети без лимита трафика (Wi-Fi), находим другие устройства группы
 * и обмениваемся данными. Полученное лежит в SharedPreferences, а страница подхватывает его при открытии приложения.
 */
class SyncJob : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        Thread {
            try {
                val p = getSharedPreferences("sync", Context.MODE_PRIVATE)
                val gid = p.getString("gid", "") ?: ""; val gkey = p.getString("gkey", "") ?: ""; val snap = p.getString("snap", "") ?: ""
                if (gid.isNotEmpty() && gkey.isNotEmpty() && snap.isNotEmpty()) {
                    val net = SyncNet { }; net.gid = gid; net.did = p.getString("did", "") ?: ""
                    val res = net.autoExchange(gkey, snap)
                    val pend = try { JSONArray(p.getString("pending", "[]")) } catch (_: Exception) { JSONArray() }
                    for (i in 0 until res.length()) {
                        val r = res.getJSONObject(i)
                        if (r.optBoolean("ok")) { pend.put(r.getString("data")); if (pend.length() > 4) pend.remove(0) }
                    }
                    if (pend.length() > 0) p.edit().putString("pending", pend.toString()).apply()
                }
            } catch (_: Exception) {}
            jobFinished(params, false)
        }.start()
        return true
    }
    override fun onStopJob(params: JobParameters) = true

    companion object {
        fun schedule(c: Context, on: Boolean) {
            val js = c.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
            if (!on) { js.cancel(7); return }
            if (js.allPendingJobs.any { it.id == 7 }) return
            js.schedule(JobInfo.Builder(7, ComponentName(c, SyncJob::class.java)).setPeriodic(15 * 60 * 1000L).setRequiredNetworkType(JobInfo.NETWORK_TYPE_UNMETERED).build())
        }
    }
}
