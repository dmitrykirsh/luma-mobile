package ws.luma.mobile

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Credentials and tokens stay in Android Keystore-backed storage, never in WebView state. */
class AnimeOnAuth(private val context: Context) {
    private val prefs = context.getSharedPreferences("animeon_private", Context.MODE_PRIVATE)
    private val http = OkHttpClient.Builder().connectTimeout(12, java.util.concurrent.TimeUnit.SECONDS).readTimeout(15, java.util.concurrent.TimeUnit.SECONDS).build()
    private val origins = listOf("https://api.animeon.cloud", "https://api.animeon.co")
    private val mediaType = "application/json".toMediaType()
    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey("luma.animeon.v1", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("luma.animeon.v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    private fun read(name: String): String = try {
        val b = Base64.decode(prefs.getString(name, ""), Base64.DEFAULT)
        val c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, b.copyOfRange(0,12)))
        String(c.doFinal(b.copyOfRange(12,b.size)), Charsets.UTF_8)
    } catch (_: Exception) { "" }
    private fun write(name: String, value: String) {
        if (value.isEmpty()) { prefs.edit().remove(name).apply(); return }
        val c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE,key())
        prefs.edit().putString(name, Base64.encodeToString(c.iv + c.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)).apply()
    }
    private data class Result(val code: Int, val json: JSONObject, val cookies: List<String>)
    private fun request(path: String, payload: JSONObject? = null, auth: Boolean = true, extra: Map<String,String> = emptyMap()): Result {
        var failure: Exception? = null
        for (origin in origins) try {
            val b = Request.Builder().url(origin + path).header("Accept", "application/json")
            if (auth) read("access").takeIf { it.isNotEmpty() }?.let { b.header("Authorization", "Bearer $it") }
            extra.forEach { (k,v) -> b.header(k,v) }
            if (payload != null) b.post(payload.toString().toRequestBody(mediaType))
            http.newCall(b.build()).execute().use { r ->
                if (r.code >= 500) throw IllegalStateException("server")
                return Result(r.code, try { JSONObject(r.body?.string() ?: "{}") } catch (_: Exception) { JSONObject() }, r.headers.values("Set-Cookie"))
            }
        } catch (e: Exception) { failure = e }
        throw failure ?: IllegalStateException("network")
    }
    private fun token(j: JSONObject) = j.optString("access_token").ifEmpty { j.optString("accessToken") }.ifEmpty { j.optJSONObject("data")?.optString("access_token") ?: "" }
    private fun saveRefresh(r: Result) { val c=r.cookies.firstOrNull { it.startsWith("refresh_token=", true) }?.substringAfter('=')?.substringBefore(';'); if (!c.isNullOrEmpty()) write("refresh",c) }
    private fun refresh(): Boolean {
        val old=read("refresh"); if (old.isEmpty()) return false
        val r=request("/api/auth/refresh",JSONObject(),false,mapOf("Cookie" to "refresh_token=$old")); val t=token(r.json)
        if (r.code !in 200..299 || t.isEmpty()) return false
        write("access",t); saveRefresh(r); return true
    }
    private fun authenticated(path:String, payload:JSONObject?=null, extra:Map<String,String> = emptyMap()):Result {
        var r=request(path,payload,true,extra); if(r.code==401 && (refresh() || JSONObject(loginSaved()).optBoolean("ok"))) r=request(path,payload,true,extra); return r
    }
    @Synchronized fun loginSecret(): String {
        val saved=read("login"); val stamp=prefs.getLong("loginUpdatedAt",0)
        if(saved.isNotEmpty()) return try { JSONObject(saved).put("updatedAt",stamp).toString() } catch (_:Exception) { "" }
        return if(stamp>0) JSONObject().put("deleted",true).put("updatedAt",stamp).toString() else ""
    }
    @Synchronized fun adoptLoginSecret(raw:String):Boolean = try {
        val v=JSONObject(raw); val stamp=v.optLong("updatedAt",0)
        if(stamp<=0 || stamp<=prefs.getLong("loginUpdatedAt",0)) false
        else if(v.optBoolean("deleted",false)) { write("login",""); prefs.edit().putLong("loginUpdatedAt",stamp).apply(); true }
        else { val email=v.optString("email").trim(); val password=v.optString("password")
            if(email.isEmpty() || email.length>320 || password.isEmpty() || password.length>1024) false
            else {
                val existing=try { JSONObject(read("login")) } catch (_:Exception) { JSONObject() }
                val changed=existing.optString("email")!=email || existing.optString("password")!=password
                write("login",JSONObject().put("email",email).put("password",password).toString())
                if(changed) { write("access",""); write("refresh",""); prefs.edit().putString("email",email).putBoolean("registered",false).apply() }
                prefs.edit().putLong("loginUpdatedAt",stamp).apply();true
            }
        }
    } catch (_:Exception) { false }
    fun loginSaved():String { val s=read("login"); if(s.isEmpty()) return JSONObject().put("error","AUTH_REQUIRED").toString();return try { val j=JSONObject(s); login(j.optString("email"),j.optString("password"),false) } catch (_:Exception) { JSONObject().put("error","AUTH_REQUIRED").toString() } }
    fun status(): String = JSONObject().put("connected",read("access").isNotEmpty()).put("email",prefs.getString("email", "")).toString()
    fun login(email:String,password:String, saveCredentials:Boolean = true):String = try {
        if(email.isBlank() || password.isEmpty()) JSONObject().put("error","BAD_REQUEST").toString() else {
            val r=request("/api/auth/login",JSONObject().put("email",email.trim()).put("password",password),false); val t=token(r.json)
            if(r.code !in 200..299 || t.isEmpty()) JSONObject().put("error",if(r.code==401) "INVALID_CREDENTIALS" else "AUTH_FAILED").toString()
            else { write("access",t); write("refresh",""); saveRefresh(r); if(saveCredentials) { write("login",JSONObject().put("email",email.trim()).put("password",password).toString());prefs.edit().putLong("loginUpdatedAt",maxOf(System.currentTimeMillis(),prefs.getLong("loginUpdatedAt",0)+1)).apply() }; prefs.edit().putString("email",email.trim()).putBoolean("registered",false).apply(); JSONObject().put("ok",true).toString() }
        }
    } catch (_:Exception) { JSONObject().put("error","NETWORK").toString() }
    fun logout():String { write("access",""); write("refresh",""); write("login",""); prefs.edit().remove("email").putBoolean("registered",false).putLong("loginUpdatedAt",maxOf(System.currentTimeMillis(),prefs.getLong("loginUpdatedAt",0)+1)).apply(); return "{}" }
    fun resolve(input:String):String { return try {
        val v=JSONObject(input); val id=v.optString("animeId"); val ep=v.optInt("episode"); val voice=v.optString("translation")
        if(read("access").isEmpty() && !JSONObject(loginSaved()).optBoolean("ok")) return JSONObject().put("error","AUTH_REQUIRED").toString()
        if(id.isBlank() || ep<1 || voice.isBlank()) return JSONObject().put("error","BAD_REQUEST").toString()
        var fp=prefs.getString("fingerprint","") ?: ""
        if(!fp.matches(Regex("[a-f0-9]{64}"))) { val bytes=ByteArray(32);SecureRandom().nextBytes(bytes);fp=bytes.joinToString(""){ "%02x".format(it) };prefs.edit().putString("fingerprint",fp).putBoolean("registered",false).apply() }
        fun register():Boolean { val r=authenticated("/api/playback/register-fp",JSONObject().put("fp_hash",fp));val ok=r.code in 200..299;if(ok)prefs.edit().putBoolean("registered",true).apply();return ok }
        if(!prefs.getBoolean("registered",false) && !register()) return JSONObject().put("error","DEVICE_REGISTRATION_FAILED").toString()
        val body=JSONObject().put("anime_id",id).put("episode",ep).put("translation",voice).put("fresh",false).put("multiaudio",true)
        fun play()=authenticated("/api/playback/resolve",body,mapOf("X-Watch-FP" to fp))
        var r=play(); if(r.code==403 && r.json.optString("error")=="fingerprint_unknown" && register()) r=play()
        if(r.code !in 200..299) return JSONObject().put("error",if(r.code==401) "AUTH_REQUIRED" else "RESOLVE_FAILED").toString()
        val j=r.json; if(j.optString("source")!="vod" || !j.optBoolean("is_master")) return JSONObject().put("error","STREAM_UNAVAILABLE").toString()
        val url=listOf(j.optString("hls_url"),j.optString("file_url"),j.optString("stream_url"),j.optString("url"),j.optJSONObject("stream")?.optString("hls_url") ?: "").firstOrNull { it.startsWith("https://") } ?: return JSONObject().put("error","STREAM_UNAVAILABLE").toString()
        val tracks=j.optJSONArray("audio_tracks"); var index=j.optInt("default_audio_index",0); var matched=false; if(tracks!=null) for(i in 0 until tracks.length()) { val a=tracks.optJSONObject(i) ?: continue; if(a.optString("translation")==voice) { index=a.optInt("index",index); matched=true } }; if(tracks!=null && tracks.length()>0 && !matched) return JSONObject().put("error","VOICE_UNAVAILABLE").toString()
        val skips=org.json.JSONArray(); val rawSkips=j.optJSONObject("segments")?.optJSONArray("skip")
        if(rawSkips!=null) for(i in 0 until rawSkips.length()) { val s=rawSkips.optJSONObject(i) ?: continue; val type=s.optString("type");val start=s.optDouble("start",Double.NaN);val end=s.optDouble("end",Double.NaN);if(type in listOf("op","ed") && start.isFinite() && end.isFinite() && start>=0 && end>start && end-start<=300)skips.put(JSONObject().put("type",type).put("start",start).put("end",end)) }
        JSONObject().put("url",url).put("audioIndex",index).put("duration",j.optDouble("episode_duration",0.0)).put("skips",skips).toString()
    } catch (_:Exception) { JSONObject().put("error","NETWORK").toString() } }
}
