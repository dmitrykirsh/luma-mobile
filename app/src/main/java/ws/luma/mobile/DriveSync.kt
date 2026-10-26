package ws.luma.mobile

import android.content.Context
import android.content.Intent
import android.net.Uri
import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.InetAddress
import java.net.ServerSocket
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.TimeUnit

/**
 * Синхронизация через Google Drive (scope drive.file — файлы, созданные приложениями Luma; все они в одном проекте Google,
 * поэтому файл luma-sync.json общий для ПК, телефона, ТВ и лаунчера).
 * Вход двумя способами:
 *  - браузер (телефон): обычный OAuth «код авторизации + PKCE», возврат на 127.0.0.1 — выбрали аккаунт и нажали «Разрешить»;
 *  - код на экране (ТВ без браузера): Device flow, код вводится на google.com/device.
 * Токен привязан к клиенту, который его выдал, поэтому вместе с токеном хранится kind: «desktop» (браузер) или «tv» (код на экране).
 * Токен передаётся между устройствами как секрет (kind:refresh) вместе с ключами сервисов по сети, так ТВ получает вход от телефона или ПК.
 * Данные и слияние — как в LAN-синхронизации (sync.js/mergeBackup), этот класс только носит байты туда-обратно.
 */
class DriveSync(private val ctx: Context, private val js: (String) -> Unit) {
    companion object {
        private const val FILE_NAME = "luma-sync.json"
        private const val SCOPE = "https://www.googleapis.com/auth/drive.file"
        private const val AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
        private const val DEVICE_URL = "https://oauth2.googleapis.com/device/code"
        private const val TOKEN_URL = "https://oauth2.googleapis.com/token"
        private const val DRIVE_FILES = "https://www.googleapis.com/drive/v3/files"
        private const val DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"
    }

    private val http = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS).build()
    private val prefs by lazy { ctx.getSharedPreferences("drive_sync", Context.MODE_PRIVATE) }
    @Volatile private var access = ""
    @Volatile private var accessExp = 0L
    @Volatile private var gen = 0   // номер попытки входа: новая попытка или отмена гасит предыдущую
    @Volatile private var loopback: ServerSocket? = null

    private fun refreshToken(): String = prefs.getString("refresh", "") ?: ""
    private fun kind(): String = prefs.getString("kind", "tv") ?: "tv"
    private fun fileId(): String = prefs.getString("fileId", "") ?: ""
    private fun lastSync(): Long = prefs.getLong("last", 0L)
    private fun clientId(k: String) = if (k == "desktop") BuildConfig.DRIVE_DESK_ID else BuildConfig.DRIVE_CLIENT_ID
    private fun clientSecret(k: String) = if (k == "desktop") BuildConfig.DRIVE_DESK_SECRET else BuildConfig.DRIVE_CLIENT_SECRET
    private fun cb(fn: String, o: JSONObject) = js("window.$fn && window.$fn(" + JSONObject.quote(o.toString()) + ")")
    private fun err(fn: String, e: String) = cb(fn, JSONObject().put("error", e))

    fun state(): String = JSONObject().put("connected", refreshToken().isNotEmpty()).put("last", lastSync())
        .put("name", prefs.getString("name", "") ?: "").put("photo", prefs.getString("photo", "") ?: "").put("email", prefs.getString("email", "") ?: "").toString()

    fun disconnect() { prefs.edit().clear().apply(); access = ""; accessExp = 0 }

    /** Вход для передачи другим устройствам: «kind:refresh» или пусто. */
    fun secret(): String { val r = refreshToken(); return if (r.isEmpty()) "" else kind() + ":" + r }

    /** Принять вход, пришедший от другого устройства. Если уже вошли сами — свой не заменяем. Возвращает true, если приняли. */
    fun adopt(v: String): Boolean {
        val m = Regex("^(desktop|tv):(.+)$").matchEntire(v) ?: return false
        if (refreshToken().isNotEmpty()) return false
        prefs.edit().putString("refresh", m.groupValues[2]).putString("kind", m.groupValues[1]).remove("fileId").apply()
        access = ""; accessExp = 0
        return true
    }

    private fun store(refresh: String, kind: String) { prefs.edit().putString("refresh", refresh).putString("kind", kind).remove("fileId").apply() }

    /* ---------- вход через браузер (телефон) ---------- */
    fun connectBrowserAsync() {
        val my = ++gen
        Thread({
            var server: ServerSocket? = null
            try {
                val id = BuildConfig.DRIVE_DESK_ID
                if (id.isEmpty()) { err("lumaDriveConnected", "NO_CREDS"); return@Thread }
                val rnd = SecureRandom()
                val vb = ByteArray(32).also { rnd.nextBytes(it) }
                val verifier = android.util.Base64.encodeToString(vb, android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP)
                val challenge = android.util.Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()), android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP)
                val state = ByteArray(12).also { rnd.nextBytes(it) }.joinToString("") { "%02x".format(it) }
                server = ServerSocket(0, 4, InetAddress.getByName("127.0.0.1")); loopback = server
                server.soTimeout = 1000
                val redirect = "http://127.0.0.1:${server.localPort}"
                val url = AUTH_URL + "?" + listOf("client_id" to id, "redirect_uri" to redirect, "response_type" to "code", "scope" to SCOPE, "code_challenge" to challenge,
                    "code_challenge_method" to "S256", "state" to state, "access_type" to "offline", "prompt" to "consent")
                    .joinToString("&") { it.first + "=" + java.net.URLEncoder.encode(it.second, "UTF-8") }
                ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                val deadline = System.currentTimeMillis() + 5 * 60 * 1000L
                var code = ""; var failed = ""
                while (my == gen && System.currentTimeMillis() < deadline && code.isEmpty() && failed.isEmpty()) {
                    val sock = try { server.accept() } catch (_: java.net.SocketTimeoutException) { continue }
                    sock.use { s ->
                        s.soTimeout = 5000
                        val line = s.getInputStream().bufferedReader().readLine() ?: ""
                        val q = Uri.parse("http://127.0.0.1" + (line.split(" ").getOrNull(1) ?: "/"))
                        val c = q.getQueryParameter("code")
                        val ok = !c.isNullOrEmpty() && q.getQueryParameter("state") == state
                        if (ok) code = c!! else if (q.getQueryParameter("error") != null) failed = q.getQueryParameter("error")!!
                        if (ok || q.getQueryParameter("error") != null) {
                            val body = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Luma</title><body style=\"margin:0;height:100vh;display:grid;place-items:center;background:#0b0c10;color:#f2f3f5;font:20px system-ui,sans-serif;text-align:center\"><div><div style=\"font-size:54px\">" +
                                (if (ok) "✓" else "✕") + "</div><p>" + (if (ok) "Готово. Вернитесь в приложение Luma." else "Вход не удался. Вернитесь в Luma и попробуйте ещё раз.") + "</p></div>"
                            val b = body.toByteArray(Charsets.UTF_8)
                            s.getOutputStream().apply { write(("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${b.size}\r\nConnection: close\r\n\r\n").toByteArray()); write(b); flush() }
                        } else { s.getOutputStream().apply { write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray()); flush() } }
                    }
                }
                if (my != gen) return@Thread
                if (failed.isNotEmpty()) { err("lumaDriveConnected", failed); return@Thread }
                if (code.isEmpty()) { err("lumaDriveConnected", "TIMEOUT"); return@Thread }
                val tb = FormBody.Builder().add("code", code).add("client_id", id).add("client_secret", BuildConfig.DRIVE_DESK_SECRET)
                    .add("redirect_uri", redirect).add("grant_type", "authorization_code").add("code_verifier", verifier).build()
                val t = JSONObject(http.newCall(Request.Builder().url(TOKEN_URL).post(tb).build()).execute().body?.string() ?: "{}")
                if (!t.has("access_token") || !t.has("refresh_token")) { err("lumaDriveConnected", t.optString("error", "TOKEN")); return@Thread }
                access = t.getString("access_token"); accessExp = System.currentTimeMillis() + t.optInt("expires_in", 3600) * 1000L
                store(t.getString("refresh_token"), "desktop")
                cb("lumaDriveConnected", JSONObject().put("ok", true))
            } catch (e: Exception) { if (my == gen) err("lumaDriveConnected", "NETWORK") }
            finally { try { server?.close() } catch (_: Exception) {}; loopback = null }
        }, "luma-drive-browser").start()
    }

    /* ---------- вход по коду на экране (ТВ) ---------- */
    fun connectAsync() {
        val my = ++gen
        Thread({
            try {
                val id = BuildConfig.DRIVE_CLIENT_ID
                if (id.isEmpty()) { err("lumaDriveConnected", "NO_CREDS"); return@Thread }
                val body = FormBody.Builder().add("client_id", id).add("scope", SCOPE).build()
                val r = http.newCall(Request.Builder().url(DEVICE_URL).post(body).build()).execute()
                val d = JSONObject(r.body?.string() ?: "{}")
                val deviceCode = d.optString("device_code")
                if (deviceCode.isEmpty()) { err("lumaDriveConnected", "DEVICE"); return@Thread }
                cb("lumaDriveCode", JSONObject().put("url", d.optString("verification_url", "https://www.google.com/device")).put("code", d.optString("user_code")))
                val intervalMs = Math.max(5, d.optInt("interval", 5)) * 1000L
                val deadline = System.currentTimeMillis() + d.optInt("expires_in", 1800) * 1000L
                while (my == gen && System.currentTimeMillis() < deadline) {
                    Thread.sleep(intervalMs)
                    if (my != gen) return@Thread
                    val tb = FormBody.Builder().add("client_id", id).add("client_secret", BuildConfig.DRIVE_CLIENT_SECRET)
                        .add("device_code", deviceCode).add("grant_type", "urn:ietf:params:oauth:grant-type:device_code").build()
                    val tr = http.newCall(Request.Builder().url(TOKEN_URL).post(tb).build()).execute()
                    val t = JSONObject(tr.body?.string() ?: "{}")
                    if (t.has("access_token")) {
                        access = t.getString("access_token"); accessExp = System.currentTimeMillis() + t.optInt("expires_in", 3600) * 1000L
                        if (t.has("refresh_token")) store(t.getString("refresh_token"), "tv")
                        cb("lumaDriveConnected", JSONObject().put("ok", true))
                        return@Thread
                    }
                    val e = t.optString("error")
                    if (e.isNotEmpty() && e != "authorization_pending" && e != "slow_down") { err("lumaDriveConnected", e); return@Thread }
                }
                if (my == gen) err("lumaDriveConnected", "TIMEOUT")
            } catch (e: Exception) { if (my == gen) err("lumaDriveConnected", "NETWORK") }
        }, "luma-drive-connect").start()
    }
    fun cancelConnect() { gen++; try { loopback?.close() } catch (_: Exception) {} }

    private fun ensureAccess(): String {
        if (access.isNotEmpty() && System.currentTimeMillis() < accessExp - 15000) return access
        val refresh = refreshToken(); if (refresh.isEmpty()) throw Exception("NO_AUTH")
        val k = kind()
        val body = FormBody.Builder().add("client_id", clientId(k)).add("client_secret", clientSecret(k))
            .add("refresh_token", refresh).add("grant_type", "refresh_token").build()
        val r = http.newCall(Request.Builder().url(TOKEN_URL).post(body).build()).execute()
        val t = JSONObject(r.body?.string() ?: "{}")
        if (!t.has("access_token")) throw Exception("NO_AUTH")
        access = t.getString("access_token"); accessExp = System.currentTimeMillis() + t.optInt("expires_in", 3600) * 1000L
        return access
    }

    /** Имя, почта и фото аккаунта (Drive about.get разрешён и при scope drive.file); кэшируем, чтобы показывать в настройках. */
    private fun loadProfile(token: String) {
        if (!prefs.getString("name", "").isNullOrEmpty()) return
        try {
            val r = http.newCall(Request.Builder().url("https://www.googleapis.com/drive/v3/about?fields=user(displayName,photoLink,emailAddress)").header("Authorization", "Bearer $token").build()).execute()
            val u = JSONObject(r.body?.string() ?: "{}").optJSONObject("user") ?: return
            prefs.edit().putString("name", u.optString("displayName")).putString("photo", u.optString("photoLink")).putString("email", u.optString("emailAddress")).apply()
        } catch (_: Exception) {}
    }

    /** Удалить файл синхронизации с Google Диска и отключиться. */
    fun deleteRemoteAsync() {
        Thread({
            try {
                val token = ensureAccess()
                var id = fileId()
                if (id.isEmpty()) {
                    val q = "name='$FILE_NAME' and trashed=false"
                    val r = http.newCall(Request.Builder().url("$DRIVE_FILES?q=" + java.net.URLEncoder.encode(q, "UTF-8") + "&fields=files(id)").header("Authorization", "Bearer $token").build()).execute()
                    val files = JSONObject(r.body?.string() ?: "{}").optJSONArray("files")
                    if (files != null && files.length() > 0) id = files.getJSONObject(0).getString("id")
                }
                if (id.isNotEmpty()) {
                    val r = http.newCall(Request.Builder().url("$DRIVE_FILES/$id").delete().header("Authorization", "Bearer $token").build()).execute()
                    if (!r.isSuccessful && r.code != 404) throw Exception("DELETE")
                }
                disconnect()
                cb("lumaDriveDeleted", JSONObject().put("ok", true))
            } catch (e: Exception) { err("lumaDriveDeleted", if (e.message == "NO_AUTH") "NO_AUTH" else "NETWORK") }
        }, "luma-drive-delete").start()
    }

    /* ---------- скачать то, что лежит в Drive (для слияния в JS) ---------- */
    fun fetchRemoteAsync() {
        Thread({
            try {
                if (refreshToken().isEmpty()) { err("lumaDriveRemote", "NO_AUTH"); return@Thread }
                val token = ensureAccess()
                loadProfile(token)
                var id = fileId()
                if (id.isEmpty()) {
                    val q = "name='$FILE_NAME' and trashed=false"
                    val url = "$DRIVE_FILES?q=" + java.net.URLEncoder.encode(q, "UTF-8") + "&fields=files(id)"
                    val r = http.newCall(Request.Builder().url(url).header("Authorization", "Bearer $token").build()).execute()
                    val files = JSONObject(r.body?.string() ?: "{}").optJSONArray("files")
                    if (files != null && files.length() > 0) { id = files.getJSONObject(0).getString("id"); prefs.edit().putString("fileId", id).apply() }
                }
                if (id.isEmpty()) { cb("lumaDriveRemote", JSONObject().put("ok", true)); return@Thread }
                val dr = http.newCall(Request.Builder().url("$DRIVE_FILES/$id?alt=media").header("Authorization", "Bearer $token").build()).execute()
                if (!dr.isSuccessful) { cb("lumaDriveRemote", JSONObject().put("ok", true)); return@Thread }
                cb("lumaDriveRemote", JSONObject().put("ok", true).put("data", dr.body?.string() ?: ""))
            } catch (e: Exception) { err("lumaDriveRemote", if (e.message == "NO_AUTH") "NO_AUTH" else "NETWORK") }
        }, "luma-drive-fetch").start()
    }

    /* ---------- залить объединённые данные обратно ---------- */
    fun uploadAsync(exportJson: String) {
        Thread({
            try {
                val token = ensureAccess()
                val id = fileId()
                if (id.isNotEmpty()) {
                    val r = http.newCall(Request.Builder().url("$DRIVE_UPLOAD/$id?uploadType=media").patch(exportJson.toRequestBody("application/json".toMediaType()))
                        .header("Authorization", "Bearer $token").build()).execute()
                    if (!r.isSuccessful) throw Exception("UPLOAD")
                } else {
                    val meta = JSONObject().put("name", FILE_NAME).toString().toRequestBody("application/json; charset=UTF-8".toMediaType())
                    val data = exportJson.toRequestBody("application/json".toMediaType())
                    val mp = MultipartBody.Builder().setType("multipart/related".toMediaType()).addPart(meta).addPart(data).build()
                    val r = http.newCall(Request.Builder().url("$DRIVE_UPLOAD?uploadType=multipart").post(mp).header("Authorization", "Bearer $token").build()).execute()
                    if (!r.isSuccessful) throw Exception("UPLOAD")
                    val newId = JSONObject(r.body?.string() ?: "{}").optString("id")
                    if (newId.isNotEmpty()) prefs.edit().putString("fileId", newId).apply()
                }
                prefs.edit().putLong("last", System.currentTimeMillis()).apply()
                cb("lumaDriveUploaded", JSONObject().put("ok", true))
            } catch (e: Exception) { err("lumaDriveUploaded", if (e.message == "NO_AUTH") "NO_AUTH" else "NETWORK") }
        }, "luma-drive-upload").start()
    }
}
