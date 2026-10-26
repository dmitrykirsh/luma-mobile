package ws.luma.mobile

import android.content.Context
import android.util.Base64
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import okhttp3.Cache
import okhttp3.Dns
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.dnsoverhttps.DnsOverHttps
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.net.InetAddress
import java.net.URI
import java.util.concurrent.TimeUnit

/**
 * Сетевой слой для страницы: запросы идут через приложение, а не через WebView.
 *  - TMDB (api.themoviedb.org, image.tmdb.org): в некоторых сетях роутер подменяет адреса на 127.0.0.1,
 *    поэтому при такой подмене адрес узнаём по DNS-over-HTTPS.
 *  - /__p/<токен>: произвольный адрес с нужными User-Agent и Referer (плейлисты, телепрограмма, потоки ТВ-каналов).
 *    У плейлистов HLS адреса сегментов переписываются на тот же прокси, к ответам добавляется CORS.
 */
class NetProxy(ctx: Context) {
    private val tmdbHosts = setOf("api.themoviedb.org", "image.tmdb.org")

    private val bootstrap = OkHttpClient.Builder().connectTimeout(6, TimeUnit.SECONDS).readTimeout(6, TimeUnit.SECONDS).build()
    private fun doh(url: String, vararg ips: String) = DnsOverHttps.Builder().client(bootstrap).url(url.toHttpUrl())
        .bootstrapDnsHosts(ips.map { InetAddress.getByName(it) }).includeIPv6(false).build()
    // адреса cloudflare-dns.com: с них приходят настоящие адреса TMDB (с 1.1.1.1 и dns.google приходит 127.0.0.1)
    private val cf = doh("https://cloudflare-dns.com/dns-query", "104.16.248.249", "104.16.249.249")
    private val google = doh("https://dns.google/dns-query", "8.8.8.8", "8.8.4.4")

    // Адреса, которые не сработали (CDN блокирует страну или соединение не проходит), и последний рабочий адрес хоста
    private val badIps = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val goodIp = java.util.concurrent.ConcurrentHashMap<String, String>()
    private val prefs = ctx.getSharedPreferences("net", Context.MODE_PRIVATE)
    init { for ((k, v) in prefs.all) if (v is String) goodIp[k] = v }   // рабочие адреса переживают перезапуск, чтобы не искать их заново
    private fun isBad(ip: InetAddress) = (badIps[ip.hostAddress] ?: 0L) > System.currentTimeMillis()
    private fun markBad(ip: String?) { if (ip != null) { badIps[ip] = System.currentTimeMillis() + 10 * 60_000L; goodIp.values.remove(ip); prefs.edit().apply { for ((k, v) in prefs.all) if (v == ip) remove(k) }.apply() } }

    private val known = mapOf(
        "api.themoviedb.org" to listOf("3.173.161.8", "3.173.161.20", "3.173.161.61", "3.173.161.72", "99.84.152.8", "99.84.152.32", "99.84.152.53", "99.84.152.85"),
        "image.tmdb.org" to listOf("3.174.113.17", "3.174.113.43", "3.174.113.59", "3.174.113.60")
    )

    private val dns = object : Dns {
        override fun lookup(hostname: String): List<InetAddress> {
            val loop = { l: List<InetAddress> -> l.isEmpty() || l.all { it.isLoopbackAddress || it.isAnyLocalAddress } }
            val sys = try { Dns.SYSTEM.lookup(hostname) } catch (_: Exception) { emptyList() }
            if (!loop(sys)) return sys
            // адрес подменён на 127.0.0.1: собираем настоящие адреса из нескольких ответов DNS-over-HTTPS (они у CDN меняются от запроса к запросу)
            val found = LinkedHashSet<InetAddress>()
            goodIp[hostname]?.let { try { found.add(InetAddress.getByName(it)) } catch (_: Exception) {} }
            val tries = listOf<(String) -> List<InetAddress>>({ cf.lookup(it) }, { cf.lookup(it) }, { google.lookup(it) })
            for (r in tries) {
                val l = try { r(hostname) } catch (e: Exception) { android.util.Log.w("LumaNet", "doh $hostname: $e"); emptyList() }
                for (a in l) if (!a.isLoopbackAddress && !a.isAnyLocalAddress) found.add(a)
            }
            // из России TMDB отдаёт пустой адрес даже по DNS-over-HTTPS: последний резерв, встроенные настоящие адреса (CloudFront)
            for (ip in known[hostname] ?: emptyList()) try { found.add(InetAddress.getByName(ip)) } catch (_: Exception) {}
            val ok = found.filter { !isBad(it) }
            if (ok.isNotEmpty()) return ok
            if (found.isNotEmpty()) { badIps.clear(); return found.toList() }
            return Dns.SYSTEM.lookup(hostname)
        }
    }

    // запоминаем, к какому адресу подключился вызов, и отбрасываем адреса, с которыми не удалось соединиться
    private val ipListener = object : okhttp3.EventListener() {
        override fun connectFailed(call: okhttp3.Call, inetSocketAddress: java.net.InetSocketAddress, proxy: java.net.Proxy, protocol: okhttp3.Protocol?, ioe: java.io.IOException) {
            markBad(inetSocketAddress.address?.hostAddress)
        }
        override fun connectionAcquired(call: okhttp3.Call, connection: okhttp3.Connection) {
            call.request().tag(java.util.concurrent.atomic.AtomicReference::class.java)?.let {
                @Suppress("UNCHECKED_CAST") (it as java.util.concurrent.atomic.AtomicReference<String?>).set(connection.route().socketAddress.address.hostAddress)
            }
        }
    }

    private val client = OkHttpClient.Builder().dns(dns).eventListener(ipListener)
        .connectTimeout(7, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS)
        .cache(Cache(File(ctx.cacheDir, "net-http"), 60L * 1024 * 1024)).build()
    // потоки живые и долгие: без общего кэша и с большим таймаутом чтения
    private val streamClient = client.newBuilder().cache(null).readTimeout(45, TimeUnit.SECONDS).build()

    private val cors = mapOf(
        "Access-Control-Allow-Origin" to "*", "Access-Control-Allow-Headers" to "*",
        "Access-Control-Allow-Methods" to "GET,OPTIONS", "Cache-Control" to "no-store"
    )

    private fun empty(code: Int, msg: String) = WebResourceResponse("text/plain", "utf-8", code, msg, cors, ByteArrayInputStream(ByteArray(0)))

    fun handles(req: WebResourceRequest): Boolean {
        val h = req.url.host
        return (h != null && h in tmdbHosts) || (h == "liftw.ws" && req.url.path?.startsWith("/__p/") == true)
    }

    fun serve(req: WebResourceRequest): WebResourceResponse? {
        if (req.method == "OPTIONS") return empty(204, "No Content")
        if (req.method != "GET") return null
        return if (req.url.host == "liftw.ws") stream(req) else tmdb(req)
    }

    private fun tmdb(req: WebResourceRequest): WebResourceResponse {
        var last = 502
        val isImage = req.url.host == "image.tmdb.org"
        // до трёх попыток: если CDN ответил 403 (блокировка страны) или не отвечает, этот адрес отбрасываем и берём другой
        for (attempt in 0 until (if (isImage) 2 else 3)) {
            val used = java.util.concurrent.atomic.AtomicReference<String?>(null)
            try {
                val b = Request.Builder().url(req.url.toString()).tag(java.util.concurrent.atomic.AtomicReference::class.java, used)
                for ((k, v) in req.requestHeaders) if (k.equals("Authorization", true) || k.equals("Accept", true)) b.header(k, v)
                val r = client.newCall(b.build()).execute()
                if (r.code == 403 || r.code >= 500) {
                    last = r.code; r.close()
                    android.util.Log.w("LumaNet", "tmdb ${req.url.host} ${r.code} via ${used.get()}")
                    markBad(used.get()); client.connectionPool.evictAll(); continue
                }
                used.get()?.let { if (goodIp[req.url.host!!] != it) { goodIp[req.url.host!!] = it; prefs.edit().putString(req.url.host!!, it).apply() } }
                val type = r.header("Content-Type") ?: "application/octet-stream"
                val h = HashMap(cors); r.header("Cache-Control")?.let { h["Cache-Control"] = it }
                return WebResourceResponse(type.substringBefore(';').trim(), "utf-8", r.code, r.message.ifEmpty { "OK" }, h, r.body?.byteStream())
            } catch (e: Exception) {
                android.util.Log.w("LumaNet", "tmdb ${req.url.host} via ${used.get()}: $e")
                markBad(used.get()); client.connectionPool.evictAll()
            }
        }
        // картинки: напрямую не получилось (CDN блокирует страну или адрес) — берём ту же картинку через публичный прокси изображений
        if (isImage) viaImageProxy(req)?.let { return it }
        return empty(if (last == 403) 403 else 502, "Bad Gateway")
    }

    /** Скачивает файл с отчётом о прогрессе (для обновления приложения). */
    fun download(url: String, dest: File, progress: (Int) -> Unit) {
        val r = streamClient.newBuilder().readTimeout(60, TimeUnit.SECONDS).build().newCall(Request.Builder().url(url).header("User-Agent", "Luma-TV").build()).execute()
        if (!r.isSuccessful) { r.close(); throw java.io.IOException("HTTP " + r.code) }
        val body = r.body!!; val total = body.contentLength(); var got = 0L; var last = -1
        dest.parentFile?.mkdirs()
        body.byteStream().use { inp -> dest.outputStream().use { out ->
            val buf = ByteArray(64 * 1024)
            while (true) { val n = inp.read(buf); if (n < 0) break; out.write(buf, 0, n); got += n; if (total > 0) { val p = (got * 100 / total).toInt(); if (p != last) { last = p; progress(p) } } }
        } }
    }

    private fun viaImageProxy(req: WebResourceRequest): WebResourceResponse? {
        for (host in listOf("wsrv.nl", "images.weserv.nl")) {
            try {
                val u = "https://$host/?url=" + java.net.URLEncoder.encode(req.url.host + req.url.encodedPath, "UTF-8")
                val r = client.newCall(Request.Builder().url(u).build()).execute()
                if (!r.isSuccessful) { r.close(); continue }
                val type = r.header("Content-Type") ?: "image/jpeg"
                val h = HashMap(cors); h["Cache-Control"] = "max-age=86400"
                return WebResourceResponse(type.substringBefore(';').trim(), "utf-8", 200, "OK", h, r.body?.byteStream())
            } catch (e: Exception) { android.util.Log.w("LumaNet", "image proxy $host: $e") }
        }
        return null
    }

    private fun proxify(url: String, ua: String, ref: String): String {
        val j = JSONObject().put("u", url).put("ua", ua).put("ref", ref).toString()
        return "https://liftw.ws/__p/" + Base64.encodeToString(j.toByteArray(), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }

    private fun rewriteM3u8(text: String, base: String, ua: String, ref: String): String {
        val abs = { x: String -> try { proxify(URI(base).resolve(x).toString(), ua, ref) } catch (_: Exception) { x } }
        return text.split(Regex("\r?\n")).joinToString("\n") { line ->
            val t = line.trim()
            when {
                t.isEmpty() -> line
                t.startsWith("#") -> Regex("URI=\"([^\"]+)\"").replace(line) { m -> "URI=\"" + abs(m.groupValues[1]) + "\"" }
                else -> abs(t)
            }
        }
    }

    private fun stream(req: WebResourceRequest): WebResourceResponse {
        val tok = req.url.path!!.removePrefix("/__p/")
        val o = try { JSONObject(String(Base64.decode(tok, Base64.URL_SAFE), Charsets.UTF_8)) } catch (_: Exception) { return empty(400, "bad") }
        val url = o.optString("u"); val ua = o.optString("ua"); val ref = o.optString("ref"); val raw = o.optBoolean("raw")
        if (!Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(url)) return empty(400, "bad")
        return try {
            val b = Request.Builder().url(url).header("User-Agent", ua.ifEmpty { UA }).header("Accept", "*/*")
            if (ref.isNotEmpty()) {
                b.header("Referer", ref)
                try { val u = URI(ref); b.header("Origin", u.scheme + "://" + u.host) } catch (_: Exception) {}
            }
            req.requestHeaders["Range"]?.let { b.header("Range", it) }
            o.optJSONObject("hdr")?.let { h -> for (k in h.keys()) b.header(k, h.optString(k)) }   // дополнительные заголовки (например, ключ API)
            val isImg = Regex("""\.(png|jpe?g|webp|gif|svg|ico)(\?|#|$)""", RegexOption.IGNORE_CASE).containsMatchIn(url)
            val r = (if (isImg) client else streamClient).newCall(b.build()).execute()
            val hdr = if (isImg) cors + mapOf("Cache-Control" to "max-age=86400") else cors
            val ct = r.header("Content-Type") ?: ""
            val finalUrl = r.request.url.toString()
            val looksHls = Regex("mpegurl|m3u8", RegexOption.IGNORE_CASE).containsMatchIn(ct) ||
                Regex("\\.m3u8?(\\?|#|$)", RegexOption.IGNORE_CASE).containsMatchIn(url)
            val looksMedia = Regex("\\.(ts|m4s|mp4|aac|mp3|m4a|cmfv|cmfa|webm)(\\?|#|$)", RegexOption.IGNORE_CASE).containsMatchIn(finalUrl) ||
                Regex("^(video|audio)/", RegexOption.IGNORE_CASE).containsMatchIn(ct)
            if (r.isSuccessful && !raw && (looksHls || !looksMedia)) {
                val bytes = r.body!!.bytes()
                val head = String(bytes, 0, minOf(64, bytes.size), Charsets.UTF_8)
                if (Regex("^[\\s\\uFEFF]*#EXTM3U").containsMatchIn(head)) {
                    val txt = rewriteM3u8(String(bytes, Charsets.UTF_8).trimStart('﻿', ' ', '\n', '\r', '\t'), finalUrl, ua, ref)
                    return WebResourceResponse("application/vnd.apple.mpegurl", "utf-8", 200, "OK", hdr, ByteArrayInputStream(txt.toByteArray(Charsets.UTF_8)))
                }
                return WebResourceResponse(ct.substringBefore(';').ifEmpty { "application/octet-stream" }, "utf-8", r.code, r.message.ifEmpty { "OK" }, hdr, ByteArrayInputStream(bytes))
            }
            WebResourceResponse(ct.substringBefore(';').ifEmpty { "video/mp2t" }, "utf-8", r.code, r.message.ifEmpty { "OK" }, hdr, r.body?.byteStream())
        } catch (e: Exception) {
            android.util.Log.w("LumaNet", "stream $url: $e"); empty(502, "upstream error")
        }
    }

    companion object {
        const val UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
    }
}
