package ws.luma.mobile

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject

/** Schedules reminders without depending on the WebView being open. Times are inexact under Android battery restrictions. */
object MobileReminders {
    private const val PREFS = "luma_reminders_v1"
    private const val DATA = "entries"
    private const val FIRED = "fired"
    private const val CHANNEL = "luma_reminders"
    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private fun array(raw: String): JSONArray = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
    private fun objects(a: JSONArray) = (0 until a.length()).mapNotNull { a.optJSONObject(it) }
    private fun marker(o: JSONObject) = o.optString("id") + ":" + o.optLong("startsAt")
    private fun intent(c: Context, id: String): PendingIntent {
        val i = Intent(c, ReminderReceiver::class.java).setAction("${c.packageName}.REMINDER").setData(Uri.Builder().scheme("luma-reminder").authority(c.packageName).appendPath(id).build())
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    private fun channel(c: Context) {
        if (Build.VERSION.SDK_INT >= 26) c.getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL, "Напоминания Luma", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Начало матчей и телепередач" })
    }
    fun exactEnabled(c: Context): Boolean = Build.VERSION.SDK_INT < 31 || c.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
    fun enabled(c: Context): Boolean {
        channel(c)
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
        return NotificationManagerCompat.from(c).areNotificationsEnabled() && (Build.VERSION.SDK_INT < 26 || c.getSystemService(NotificationManager::class.java).getNotificationChannel(CHANNEL)?.importance != NotificationManager.IMPORTANCE_NONE)
    }
    @Synchronized fun replace(c: Context, raw: String) {
        if (raw.length > 250_000) return
        val parsed = try { JSONArray(raw) } catch (_: Exception) { return }
        val old = objects(array(prefs(c).getString(DATA, "[]") ?: "[]"))
        val oldIds = old.map { it.optString("id") }.toSet()
        val now = System.currentTimeMillis()
        val clean = JSONArray()
        for (x in objects(parsed).take(300)) {
            val id=x.optString("id"); val start=x.optLong("startsAt"); val title=x.optString("title").trim()
            if (id.isBlank() || id.length > 400 || title.isBlank() || start <= 0 || start > now + 366L * 86400000L) continue
            clean.put(JSONObject().put("id", id).put("title", title.take(240)).put("startsAt",start).put("endsAt",x.optLong("endsAt")).put("kind",x.optString("kind")).put("subtitle",x.optString("subtitle").take(160)).put("shown",x.optBoolean("shown")))
        }
        val next = objects(clean); val nextIds=next.map { it.optString("id") }.toSet()
        val alarm=c.getSystemService(AlarmManager::class.java)
        for (o in old) if (o.optString("id") !in nextIds) { alarm.cancel(intent(c,o.optString("id"))); NotificationManagerCompat.from(c).cancel(o.optString("id").hashCode()) }
        val fired = try { JSONObject(prefs(c).getString(FIRED,"{}") ?: "{}") } catch (_: Exception) { JSONObject() }
        for (o in next) { if (o.optString("id") !in oldIds) fired.remove(marker(o)); if (o.optBoolean("shown")) fired.put(marker(o), now) }
        val expired=fired.keys().asSequence().filter { fired.optLong(it) < now - 90L * 86400000L }.toList(); for (key in expired) fired.remove(key)
        prefs(c).edit().putString(DATA,clean.toString()).putString(FIRED,fired.toString()).commit()
        schedule(c,next,fired,now)
    }
    @Synchronized fun restore(c: Context) {
        val all=objects(array(prefs(c).getString(DATA,"[]") ?: "[]"))
        val fired=try { JSONObject(prefs(c).getString(FIRED,"{}") ?: "{}") } catch (_: Exception) { JSONObject() }
        schedule(c,all,fired,System.currentTimeMillis())
    }
    private fun schedule(c: Context, all: List<JSONObject>, fired: JSONObject, now: Long) {
        val alarm=c.getSystemService(AlarmManager::class.java)
        for (o in all) {
            val id=o.optString("id"); val start=o.optLong("startsAt"); val end=o.optLong("endsAt")
            val expiry=if(o.optString("kind")=="tv" && end>start) minOf(start+3600000L,end) else start+3600000L
            val pi=intent(c,id); alarm.cancel(pi)
            if (fired.has(marker(o)) || now >= expiry) continue
            val at=maxOf(now+2000L,start-900000L)
            try { if (exactEnabled(c)) alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi) else alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi) } catch (_: SecurityException) { alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi) }
        }
    }
    @Synchronized fun markShownInApp(c: Context, id: String, start: Long): Boolean {
        val item=objects(array(prefs(c).getString(DATA,"[]") ?: "[]")).find { it.optString("id")==id && it.optLong("startsAt")==start } ?: return false
        val now=System.currentTimeMillis(); val end=item.optLong("endsAt")
        val expiry=if(item.optString("kind")=="tv"&&end>start) minOf(start+3600000L,end) else start+3600000L
        if(now<start-900000L || now>=expiry)return false
        val fired=try { JSONObject(prefs(c).getString(FIRED,"{}") ?: "{}") } catch (_: Exception) { JSONObject() }
        val key=marker(item);if(fired.has(key))return false
        fired.put(key,now);prefs(c).edit().putString(FIRED,fired.toString()).commit()
        c.getSystemService(AlarmManager::class.java).cancel(intent(c,id))
        return true
    }
    @Synchronized fun deliver(c: Context, id: String) {
        val item=objects(array(prefs(c).getString(DATA,"[]") ?: "[]")).find { it.optString("id")==id } ?: return
        val now=System.currentTimeMillis(); val start=item.optLong("startsAt"); val end=item.optLong("endsAt")
        val expiry=if(item.optString("kind")=="tv"&&end>start) minOf(start+3600000L,end) else start+3600000L
        if(now<start-900000L || now>=expiry || !enabled(c)) return
        val fired=try { JSONObject(prefs(c).getString(FIRED,"{}") ?: "{}") } catch (_: Exception) { JSONObject() }
        val key=marker(item); if(fired.has(key)) return
        val launch=c.packageManager.getLaunchIntentForPackage(c.packageName)?.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val tap=launch?.let { PendingIntent.getActivity(c,0,it,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
        val time=java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(start))
        val text=(if(now<start) "Начало в " else "Начало было в ")+time+item.optString("subtitle").let { if(it.isBlank()) "" else " · $it" }
        val n=NotificationCompat.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_notification).setContentTitle(item.optString("title")).setContentText(text).setStyle(NotificationCompat.BigTextStyle().bigText(text)).setAutoCancel(true).setContentIntent(tap).build()
        try { NotificationManagerCompat.from(c).notify(id.hashCode(),n); fired.put(key,now);prefs(c).edit().putString(FIRED,fired.toString()).apply() } catch (_: SecurityException) {}
    }
}
class ReminderReceiver : BroadcastReceiver() { override fun onReceive(context: Context, intent: Intent) { intent.data?.lastPathSegment?.let { MobileReminders.deliver(context,it) } } }
class ReminderBootReceiver : BroadcastReceiver() { override fun onReceive(context: Context, intent: Intent) { if(intent.action==Intent.ACTION_BOOT_COMPLETED || intent.action==Intent.ACTION_MY_PACKAGE_REPLACED) MobileReminders.restore(context) } }
