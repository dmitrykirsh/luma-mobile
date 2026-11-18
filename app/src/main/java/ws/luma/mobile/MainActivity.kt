package ws.luma.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.webkit.ProxyConfig
import androidx.webkit.ProxyController
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * Luma для телефона: тонкая оболочка вокруг веб-интерфейса из assets. Страница отдаётся с адреса https://liftw.ws/,
 * поэтому запросы к api.liftw.ws проходят так же, как в Luma TV. Видео играет нативный ExoPlayer под прозрачной страницей.
 */
class MainActivity : Activity() {
    private val animeOn by lazy { AnimeOnAuth(this) }
    private val youtubeProxyLock = Any()
    private var youtubeProxy: Process? = null
    private var youtubeProxyGeneration = 0
    private var youtubeCustomView: View? = null
    private var youtubeCustomCallback: WebChromeClient.CustomViewCallback? = null
    private lateinit var web: WebView
    private lateinit var net: NetProxy
    private lateinit var rootLayout: FrameLayout
    private lateinit var np: NativePlayer
    private lateinit var syncNet: SyncNet
    private lateinit var driveSync: DriveSync
    private var syncSrv: ImportServer? = null
    private var pendingLink = ""

    private val loader by lazy {
        WebViewAssetLoader.Builder().setDomain("liftw.ws").addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this)).build()
    }

    /** luma://open?id=123&play=1 -> "123,1" (только цифры, чтобы в страницу не попало ничего лишнего). */
    private fun linkOf(i: Intent?): String {
        val u = i?.data ?: return ""
        if (u.scheme != "luma" || u.host != "open") return ""
        val id = u.getQueryParameter("id")?.takeIf { it.isNotEmpty() && it.length < 12 && it.all(Char::isDigit) } ?: return ""
        return id + "," + (if (u.getQueryParameter("play") == "1") "1" else "0")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val l = linkOf(intent); if (l.isEmpty()) return
        val (id, p) = l.split(',')
        js("window.lumaOpen && window.lumaOpen($id,${p == "1"})")
    }

    // Превью YouTube из этой сети не открываются: берём через локальный SOCKS5-прокси ByeByeDPI (127.0.0.1:1080), а если он выключен, напрямую
    private val ytDirect by lazy { okhttp3.OkHttpClient.Builder().connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS).readTimeout(8, java.util.concurrent.TimeUnit.SECONDS).build() }
    private val ytProxy by lazy { ytDirect.newBuilder().proxy(java.net.Proxy(java.net.Proxy.Type.SOCKS, java.net.InetSocketAddress("127.0.0.1", 1080))).build() }
    private val ytCache = object : android.util.LruCache<String, ByteArray>(6 * 1024 * 1024) { override fun sizeOf(k: String, v: ByteArray) = v.size }
    private fun ytImage(req: WebResourceRequest): WebResourceResponse {
        val url = req.url.toString(); val hdr = mapOf("Cache-Control" to "max-age=86400", "Access-Control-Allow-Origin" to "*")
        ytCache.get(url)?.let { return WebResourceResponse("image/jpeg", null, 200, "OK", hdr, java.io.ByteArrayInputStream(it)) }
        for (cl in listOf(ytProxy, ytDirect)) {
            try {
                val b = cl.newCall(okhttp3.Request.Builder().url(url).build()).execute().use { r -> if (r.isSuccessful) r.body!!.bytes() else null }
                if (b != null && b.size > 100) { ytCache.put(url, b); return WebResourceResponse("image/jpeg", null, 200, "OK", hdr, java.io.ByteArrayInputStream(b)) }
            } catch (_: Exception) {}
        }
        return WebResourceResponse("text/plain", "utf-8", 504, "Gone", emptyMap(), java.io.ByteArrayInputStream(ByteArray(0)))
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        net = NetProxy(this)
        pendingLink = linkOf(intent)
        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0B0C10"))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                setSupportMultipleWindows(false)
                textZoom = 100
            }
            CookieManager.getInstance().setAcceptCookie(true)
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                    val rh = request.url.host ?: ""
                    // лишние запросы плеера сайта: пиксели статистики и загрузчик рекламных XML (preroll). Отвечаем пустым «не найдено», плеер просто идёт без рекламы
                    if (rh == "s.namy.ws" || rh == "vuegenesisvue.com" || rh.endsWith(".vuegenesisvue.com")) return WebResourceResponse("text/plain", "utf-8", 404, "Not Found", mapOf("Access-Control-Allow-Origin" to "*"), java.io.ByteArrayInputStream(ByteArray(0)))
                    if (request.method == "GET" && (rh.endsWith("ytimg.com") || rh.endsWith("ggpht.com"))) return ytImage(request)
                    if (net.handles(request)) return net.serve(request)
                    return loader.shouldInterceptRequest(request.url)
                }
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val h = request.url.host ?: return true
                    if (h == "liftw.ws") return false
                    if (!request.isForMainFrame && synchronized(youtubeProxyLock) { youtubeProxy != null } && (h == "youtube.com" || h.endsWith(".youtube.com") || h == "youtube-nocookie.com" || h.endsWith(".youtube-nocookie.com"))) return false
                    try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) {}
                    return true
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                    if (youtubeCustomView != null) { callback.onCustomViewHidden(); return }
                    youtubeCustomView = view; youtubeCustomCallback = callback
                    rootLayout.addView(view, FrameLayout.LayoutParams(-1, -1))
                }
                override fun onHideCustomView() { hideYoutubeCustomView() }
            }
            addJavascriptInterface(Bridge(), "Native")
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "LumaAnimeOnSecret", setOf("https://liftw.ws")) { _, message, _, isMainFrame, reply ->
                if (isMainFrame) try {
                    val req=JSONObject(message.data ?: "{}"); val response=JSONObject().put("id",req.optInt("id"))
                    when(req.optString("action")) {
                        "get" -> response.put("value",animeOn.loginSecret())
                        "adopt" -> response.put("value",animeOn.adoptLoginSecret(req.optString("value")))
                        else -> response.put("error","BAD_REQUEST")
                    }
                    reply.postMessage(response.toString())
                } catch (_: Exception) {}
            }
        }
        WebView.setWebContentsDebuggingEnabled(true)
        rootLayout = FrameLayout(this).apply { setBackgroundColor(Color.BLACK); addView(web, FrameLayout.LayoutParams(-1, -1)) }
        setContentView(rootLayout)
        np = NativePlayer(this, rootLayout) { code -> js(code) }
        syncNet = SyncNet { code -> js(code) }
        driveSync = DriveSync(this) { code -> js(code) }
        if (!(getSharedPreferences("sync", Context.MODE_PRIVATE).getString("gid", "")).isNullOrEmpty()) SyncJob.schedule(this, true)   // фоновая синхронизация переживает перезапуск приложения
        web.loadUrl("https://liftw.ws/index.html")
    }

    private fun hideYoutubeCustomView() {
        youtubeCustomView?.let { rootLayout.removeView(it) }
        youtubeCustomView = null
        val callback = youtubeCustomCallback
        youtubeCustomCallback = null
        callback?.onCustomViewHidden()
    }

    override fun onPause() { super.onPause(); js("window.lumaPause && window.lumaPause(); window.lumaYoutubePause?.()") }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (youtubeCustomView != null) { hideYoutubeCustomView(); return }
        web.evaluateJavascript("window.lumaBack ? window.lumaBack() : false") { r -> if (r != "true") finish() }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 7391) { MobileReminders.restore(this); js("window.lumaReminderPermissionChanged?.()") }
    }
    override fun onResume() { super.onResume(); if (::web.isInitialized) js("window.lumaReminderPermissionChanged?.()") }

    override fun onDestroy() { hideYoutubeCustomView(); stopYoutubeProxy(); try { np.stop(); syncNet.stopResponder(); syncSrv?.stop() } catch (_: Exception) {}; web.destroy(); super.onDestroy() }

    private fun stopYoutubeProxy() {
        synchronized(youtubeProxyLock) { youtubeProxyGeneration++; youtubeProxy?.destroy(); youtubeProxy = null }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) try { ProxyController.getInstance().clearProxyOverride(androidx.core.content.ContextCompat.getMainExecutor(this)) {} } catch (_: Exception) {}
    }

    private fun js(code: String) = runOnUiThread { web.evaluateJavascript(code, null) }

    private fun <T> onMain(block: () -> T): T {
        if (Looper.myLooper() == Looper.getMainLooper()) return block()
        val f = java.util.concurrent.FutureTask { block() }
        runOnUiThread(f)
        return f.get(2, java.util.concurrent.TimeUnit.SECONDS)
    }

    /** Полноэкранный режим для плеера: системные панели прячутся и показываются по свайпу от края. */
    private fun immersive(on: Boolean) {
        if (Build.VERSION.SDK_INT >= 30) {
            val c = window.insetsController ?: return
            if (on) { c.hide(WindowInsets.Type.systemBars()); c.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE }
            else c.show(WindowInsets.Type.systemBars())
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = if (on) View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE else View.SYSTEM_UI_FLAG_VISIBLE
        }
    }

    inner class Bridge {
        @JavascriptInterface fun aoStatus(): String = animeOn.status()
        @JavascriptInterface fun aoLoginAsync(email: String, password: String) {
            Thread { val result = animeOn.login(email, password); js("window.lumaAnimeOnLogin?.(${JSONObject.quote(result)})") }.start()
        }
        @JavascriptInterface fun aoLogout(): String = animeOn.logout()
        @JavascriptInterface fun aoResolveAsync(input: String, requestId: Int) {
            Thread { val result = animeOn.resolve(input); js("window.lumaAnimeOnResolve?.($requestId,${JSONObject.quote(result)})") }.start()
        }
        @JavascriptInterface fun remindersEnabled(): Boolean = MobileReminders.enabled(this@MainActivity)
        @JavascriptInterface fun remindersMarkShown(id: String, start: Double): Boolean = MobileReminders.markShownInApp(this@MainActivity, id, start.toLong())
        @JavascriptInterface fun remindersSync(json: String) { MobileReminders.replace(this@MainActivity, json) }
        @JavascriptInterface fun remindersExactEnabled(): Boolean = MobileReminders.exactEnabled(this@MainActivity)
        @JavascriptInterface fun remindersOpenExactSettings() { runOnUiThread { if (Build.VERSION.SDK_INT >= 31) { try { startActivity(Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName"))) } catch (_: Exception) {} } } }
        @JavascriptInterface fun remindersOpenSettings() { runOnUiThread { try { val i = if (Build.VERSION.SDK_INT >= 26) Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, packageName) else Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")); startActivity(i) } catch (_: Exception) { try { startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) } catch (_: Exception) {} } } }
        @JavascriptInterface fun remindersRequestPermission() { runOnUiThread { if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 7391) } }
        @JavascriptInterface fun searchTwitch(search: String, requestId: Int) {
            val text = search.trim().take(100)
            if (text.length < 3) { js("window.mobileTwitchSearchResolved && window.mobileTwitchSearchResolved($requestId,[])"); return }
            Thread {
                val output = org.json.JSONArray()
                var failed = false
                try {
                    val conn = java.net.URL("https://gql.twitch.tv/gql").openConnection() as java.net.HttpURLConnection
                    conn.requestMethod = "POST"; conn.connectTimeout = 10000; conn.readTimeout = 10000; conn.doOutput = true
                    conn.setRequestProperty("Client-ID", "kimne78kx3ncx6brgo4mv6wki5h1ko"); conn.setRequestProperty("Content-Type", "application/json")
                    val query = "query(\$q:String!){searchStreams(userQuery:\$q,first:40){edges{node{title viewersCount broadcaster{login displayName profileImageURL(width:70)} game{name}}}}}"
                    val body = JSONObject().put("query", query).put("variables", JSONObject().put("q", text)).toString()
                    conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                    val edges = JSONObject(conn.inputStream.bufferedReader().use { it.readText() }).optJSONObject("data")?.optJSONObject("searchStreams")?.optJSONArray("edges") ?: throw IllegalStateException("Missing Twitch results")
                    if (edges != null) for (i in 0 until minOf(edges.length(), 40)) {
                        val item = edges.optJSONObject(i)?.optJSONObject("node") ?: continue; val b = item.optJSONObject("broadcaster") ?: continue
                        val id=b.optString("login"); if (!id.matches(Regex("[A-Za-z0-9_]{3,25}"))) continue
                        output.put(JSONObject().put("id",id).put("name",b.optString("displayName").take(100)).put("title",item.optString("title").take(250)).put("image",b.optString("profileImageURL")).put("game",item.optJSONObject("game")?.optString("name") ?: "").put("viewers",item.optInt("viewersCount")))
                    }
                    conn.disconnect()
                } catch (_: Exception) { failed = true }
                js("window.mobileTwitchSearchResolved && window.mobileTwitchSearchResolved($requestId," + output.toString() + "," + failed + ")")
            }.start()
        }
        @JavascriptInterface fun version(): String = try { packageManager.getPackageInfo(packageName, 0).versionName ?: "?" } catch (_: Exception) { "?" }
        @JavascriptInterface fun takeLink(): String { val l = pendingLink; pendingLink = ""; return l }
        @JavascriptInterface fun exit() { runOnUiThread { finish() } }
        /** Трейлер YouTube открываем в приложении YouTube: оно ходит через ByeByeDPI, если он включён. */
        @JavascriptInterface fun prepareYoutubeEmbed(id: String) {
            if (!id.matches(Regex("[A-Za-z0-9_-]{11}"))) return
            val generation = synchronized(youtubeProxyLock) { youtubeProxyGeneration++; youtubeProxy?.destroy(); youtubeProxy = null; youtubeProxyGeneration }
            Thread {
                try {
                    if (!WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE) || !WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE_REVERSE_BYPASS)) throw IllegalStateException("proxy unsupported")
                    val port = java.net.ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1")).use { it.localPort }
                    val helper = java.io.File(applicationInfo.nativeLibraryDir, "liblumayoutubeproxy.so")
                    val args = listOf(helper.absolutePath, "-i", "127.0.0.1", "-p", port.toString(), "-d1", "-d3+s", "-s6+s", "-d9+s", "-s12+s", "-d15+s", "-s20+s", "-d25+s", "-s30+s", "-d35+s", "-r1+s", "-S", "-a1", "-At,r,s,c", "-d1", "-d3+s", "-s6+s", "-d9+s", "-s12+s", "-d15+s", "-s20+s", "-d25+s", "-s30+s", "-d35+s", "-S", "-a1")
                    val builderProcess = ProcessBuilder(args).redirectErrorStream(true)
                    val logFile = java.io.File(cacheDir, "youtube-proxy.log")
                    val process = if (Build.VERSION.SDK_INT >= 26) builderProcess.redirectOutput(logFile).start() else builderProcess.start().also { child ->
                        Thread { try { child.inputStream.use { input -> logFile.outputStream().use { output -> input.copyTo(output) } } } catch (_: Exception) {} }.start()
                    }
                    synchronized(youtubeProxyLock) { if (generation != youtubeProxyGeneration) { process.destroy(); return@Thread }; youtubeProxy = process }
                    var available = false
                    for (attempt in 0 until 20) { try { java.net.Socket().use { it.connect(java.net.InetSocketAddress("127.0.0.1", port), 200) }; available = true; break } catch (_: Exception) { Thread.sleep(100) } }
                    if (!available) throw IllegalStateException("proxy did not start")
                    val builder = ProxyConfig.Builder().addProxyRule("socks5://127.0.0.1:$port").setReverseBypassEnabled(true)
                    listOf("youtube.com", "*.youtube.com", "youtube-nocookie.com", "*.youtube-nocookie.com", "googlevideo.com", "*.googlevideo.com", "ytimg.com", "*.ytimg.com", "ggpht.com", "*.ggpht.com").forEach { builder.addBypassRule(it) }
                    ProxyController.getInstance().setProxyOverride(builder.build(), androidx.core.content.ContextCompat.getMainExecutor(this@MainActivity)) {
                        if (synchronized(youtubeProxyLock) { generation == youtubeProxyGeneration }) js("window.lumaMobileYoutubeReady && window.lumaMobileYoutubeReady(${JSONObject.quote(id)}, true)")
                    }
                } catch (_: Exception) {
                    val current = synchronized(youtubeProxyLock) { if (generation == youtubeProxyGeneration) { youtubeProxy?.destroy(); youtubeProxy = null; true } else false }
                    if (current) js("window.lumaMobileYoutubeReady && window.lumaMobileYoutubeReady(${JSONObject.quote(id)}, false)")
                }
            }.start()
        }
        @JavascriptInterface fun clearYoutubeEmbed() = stopYoutubeProxy()
        @JavascriptInterface fun openYoutube(id: String) {
            if (!id.matches(Regex("[\\w-]{6,20}"))) return
            runOnUiThread {
                val u = Uri.parse("https://www.youtube.com/watch?v=$id")
                try { startActivity(Intent(Intent.ACTION_VIEW, u).setPackage("com.google.android.youtube")) }
                catch (_: Exception) { try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: Exception) {} }
            }
        }
        @JavascriptInterface fun openUrl(url: String) { if (url.startsWith("https://")) runOnUiThread { try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {} } }

        /** Режим плеера: ландшафт и без системных панелей; при выходе всё возвращается. */
        @JavascriptInterface fun playerMode(on: Boolean) {
            runOnUiThread {
                requestedOrientation = if (on) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                immersive(on)
                if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                web.setBackgroundColor(if (on) Color.TRANSPARENT else Color.parseColor("#0B0C10"))
            }
        }
        /** Яркость окна 0..1 (жест на левой половине экрана); -1 — как в системе. */
        @JavascriptInterface fun brightness(v: Double) {
            runOnUiThread { val lp = window.attributes; lp.screenBrightness = if (v < 0) WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE else v.toFloat().coerceIn(0.02f, 1f); window.attributes = lp }
        }
        @JavascriptInterface fun getBrightness(): Double = onMain {
            val b = window.attributes.screenBrightness
            if (b >= 0) b.toDouble() else try { android.provider.Settings.System.getInt(contentResolver, android.provider.Settings.System.SCREEN_BRIGHTNESS) / 255.0 } catch (_: Exception) { 0.5 }
        }
        /** Громкость 0..1 (жест на правой половине экрана). */
        @JavascriptInterface fun volume(v: Double) {
            val am = getSystemService(AUDIO_SERVICE) as AudioManager
            val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            am.setStreamVolume(AudioManager.STREAM_MUSIC, (v.coerceIn(0.0, 1.0) * max).toInt(), 0)
        }
        @JavascriptInterface fun getVolume(): Double {
            val am = getSystemService(AUDIO_SERVICE) as AudioManager
            return am.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / am.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        }


        /** Скачивает APK обновления и открывает установщик Android. Состояние уходит в window.lumaUpdateState. */
        @JavascriptInterface fun installUpdate(url: String) {
            Thread {
                try {
                    val f = java.io.File(cacheDir, "updates/luma-mobile-update.apk")
                    net.download(url, f) { p -> js("window.lumaUpdateState && window.lumaUpdateState({state:'downloading',pct:$p})") }
                    if (Build.VERSION.SDK_INT >= 26 && !packageManager.canRequestPackageInstalls()) {
                        js("window.lumaUpdateState && window.lumaUpdateState({state:'needperm'})")
                        runOnUiThread { try { startActivity(Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))) } catch (_: Exception) {} }
                        return@Thread
                    }
                    val uri = androidx.core.content.FileProvider.getUriForFile(this@MainActivity, "$packageName.files", f)
                    val i = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                    js("window.lumaUpdateState && window.lumaUpdateState({state:'installing'})")
                    runOnUiThread { startActivity(i) }
                } catch (e: Exception) { js("window.lumaUpdateState && window.lumaUpdateState({state:'error',msg:" + JSONObject.quote(e.message ?: "error") + "})") }
            }.start()
        }

        // синхронизация между устройствами: приём всегда включён, обмен по ключу группы, код нужен только для первого подключения
        private fun saveSnap(gid: String, gkey: String, did: String, snap: String) {
            getSharedPreferences("sync", Context.MODE_PRIVATE).edit().putString("gid", gid).putString("gkey", gkey).putString("did", did).putString("snap", snap).apply()
        }
        @JavascriptInterface fun syncServe(gid: String, gkey: String, did: String, exportJson: String): String {
            val name = try { android.provider.Settings.Global.getString(contentResolver, "device_name") } catch (_: Exception) { null } ?: Build.MODEL
            syncNet.gid = gid; syncNet.did = did; syncNet.name = name
            saveSnap(gid, gkey, did, exportJson)
            var srv = syncSrv
            if (srv == null) {
                srv = ImportServer({}, {})
                srv.onSyncIn = { plain -> js("window.lumaSyncIn && window.lumaSyncIn(" + JSONObject.quote(plain) + ")") }
                srv.onGoogleOffer = { secret, from -> if (driveSync.state().contains("\"connected\":true") || !Regex("^(desktop|tv):.+$").matches(secret)) false else { js("window.lumaDriveOffer && window.lumaDriveOffer(" + JSONObject.quote(JSONObject().put("secret", secret).put("from", from).toString()) + ")"); true } }
                try { val port = srv.start(); syncSrv = srv; srv.deviceName = name; syncNet.startResponder(name, port) } catch (_: Exception) { return "{\"error\":\"PORT\"}" }
            }
            srv.deviceName = name; srv.groupId = gid; srv.groupKey = gkey; srv.syncExport = exportJson
            SyncJob.schedule(this@MainActivity, gid.isNotEmpty())
            return JSONObject().put("name", name).put("port", srv.port).toString()
        }
        @JavascriptInterface fun syncCode(code: String) { syncSrv?.syncCode = code.ifEmpty { null } }
        @JavascriptInterface fun syncUpdate(exportJson: String) {
            syncSrv?.syncExport = exportJson
            getSharedPreferences("sync", Context.MODE_PRIVATE).edit().putString("snap", exportJson).apply()
        }
        @JavascriptInterface fun syncStop() { syncNet.stopResponder(); syncSrv?.stop(); syncSrv = null }
        @JavascriptInterface fun syncScan() { syncNet.scan() }
        @JavascriptInterface fun syncSend(ip: String, port: Int, code: String, exportJson: String) { syncNet.send(ip, port, code, exportJson) }
        @JavascriptInterface fun syncAuto(gkey: String, exportJson: String) { syncNet.autoAsync(gkey, exportJson) }
        @JavascriptInterface fun driveState(): String = driveSync.state()
        @JavascriptInterface fun driveConnect() { driveSync.connectAsync() }
        @JavascriptInterface fun driveConnectBrowser() { driveSync.connectBrowserAsync() }
        @JavascriptInterface fun driveDeleteRemote() { driveSync.deleteRemoteAsync() }
        @JavascriptInterface fun driveSecret(): String = driveSync.secret()
        @JavascriptInterface fun driveOffer() {
            val s = driveSync.secret(); if (s.isEmpty()) return
            Thread { val r = try { syncNet.offerGoogle(s, syncNet.name.ifEmpty { android.os.Build.MODEL }) } catch (_: Exception) { org.json.JSONArray() }; js("window.lumaDriveOffered && window.lumaDriveOffered(" + JSONObject.quote(r.toString()) + ")") }.start()
        }
        @JavascriptInterface fun driveAdopt(v: String): Boolean = driveSync.adopt(v)
        @JavascriptInterface fun driveConnectCancel() { driveSync.cancelConnect() }
        @JavascriptInterface fun driveDisconnect() { driveSync.disconnect() }
        @JavascriptInterface fun driveFetchRemote() { driveSync.fetchRemoteAsync() }
        @JavascriptInterface fun driveUpload(exportJson: String) { driveSync.uploadAsync(exportJson) }
        /** Данные, которые фоновая задача получила от других устройств, пока приложение было закрыто (массив JSON-строк). */
        @JavascriptInterface fun takeSyncIn(): String {
            val p = getSharedPreferences("sync", Context.MODE_PRIVATE)
            val v = p.getString("pending", "[]") ?: "[]"
            p.edit().remove("pending").apply()
            return v
        }

        // нативный плеер: все вызовы из JS переносим в главный поток
        @JavascriptInterface fun npStart(json: String) { runOnUiThread { try { np.start(json) } catch (e: Exception) { js("window.npEvent && window.npEvent('error'," + JSONObject.quote(e.toString()) + ")") } } }
        @JavascriptInterface fun npCmd(name: String, arg: Double) { runOnUiThread { np.cmd(name, arg) } }
        @JavascriptInterface fun npSelect(kind: String, g: Int, t: Int) { runOnUiThread { np.select(kind, g, t) } }
        @JavascriptInterface fun npTracks(): String = onMain { np.tracks() }
        @JavascriptInterface fun npAv1(): Boolean = onMain { np.av1Hw() }
        @JavascriptInterface fun npVp9(): Boolean = onMain { np.vp9Hw() }
        @JavascriptInterface fun npStop() { runOnUiThread { np.stop() } }
    }
}
