package ws.luma.mobile

import android.app.Activity
import android.graphics.Color
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import org.json.JSONArray
import org.json.JSONObject

/**
 * Нативный плеер (Media3/ExoPlayer) под прозрачным WebView: видео рисуется системой, а кнопки, список серий и меню
 * (звук, субтитры, качество, скорость) рисует веб-интерфейс. Управляется через мост: start/cmd/tracks/stop.
 */
class NativePlayer(private val activity: Activity, private val root: FrameLayout, private val js: (String) -> Unit) {
    private var player: ExoPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private var view: PlayerView? = null
    private var gen = 0

    private val ticker = object : Runnable {
        override fun run() { push(); handler.postDelayed(this, 500) }
    }

    private fun ensureView(): PlayerView {
        view?.let { return it }
        val v = PlayerView(activity).apply {
            useController = false
            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
            setShutterBackgroundColor(Color.BLACK)
            setKeepContentOnPlayerReset(false)
            subtitleView?.visibility = android.view.View.GONE   // субтитры рисует веб-интерфейс (npCue): так они совпадают с остальным оформлением
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        }
        root.addView(v, 0)
        view = v
        return v
    }

    /** json: { url, ua, referer, startMs, subs:[{url,name,lang}] } */
    fun start(json: String) {
        val o = JSONObject(json)
        stopInternal()
        val myGen = ++gen
        val http = DefaultHttpDataSource.Factory()
            .setUserAgent(o.optString("ua", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Safari/537.36"))
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(12000).setReadTimeoutMs(20000)
        o.optString("referer").takeIf { it.isNotEmpty() }?.let { http.setDefaultRequestProperties(mapOf("Referer" to it)) }
        val subs = ArrayList<MediaItem.SubtitleConfiguration>()
        val sa = o.optJSONArray("subs") ?: JSONArray()
        for (i in 0 until sa.length()) {
            val s = sa.getJSONObject(i)
            subs.add(MediaItem.SubtitleConfiguration.Builder(Uri.parse(s.getString("url")))
                .setMimeType(MimeTypes.TEXT_VTT).setLabel(s.optString("name")).setLanguage(s.optString("lang").ifEmpty { null }).setId("ext$i").build())
        }
        // адреса по порядку предпочтения (DASH с 1080p, затем HLS до 720p); при ошибке переходим к следующему
        val urlList = ArrayList<String>()
        o.optJSONArray("urls")?.let { for (i in 0 until it.length()) urlList.add(it.getString(i)) }
        if (urlList.isEmpty()) urlList.add(o.getString("url"))
        val subsList = subs
        var urlIdx = 0
        fun itemAt(i: Int) = MediaItem.Builder().setUri(urlList[i]).setSubtitleConfigurations(subsList).build()
        val item = itemAt(0)
        val load = DefaultLoadControl.Builder().setBufferDurationsMs(20000, 60000, 1500, 3000).build()
        val p = ExoPlayer.Builder(activity).setMediaSourceFactory(DefaultMediaSourceFactory(http)).setLoadControl(load).build()
        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
            .setPreferredAudioLanguage("ru").setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build()   // субтитры выключены, пока не выбрали
        p.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (myGen != gen) return
                if (state == Player.STATE_ENDED) js("window.npEvent && window.npEvent('ended')")
                if (state == Player.STATE_READY) js("window.npEvent && window.npEvent('ready')")
                push()
            }
            override fun onPlayerError(e: PlaybackException) {
                if (myGen != gen) return
                if (urlIdx + 1 < urlList.size) {   // например, телевизор не смог запустить видео VP9: пробуем следующий поток
                    urlIdx++
                    val pos = (player?.currentPosition ?: 0L)
                    player?.setMediaItem(itemAt(urlIdx), pos); player?.prepare(); player?.playWhenReady = true
                    js("window.npEvent && window.npEvent('fallback', " + urlIdx + ")")
                    return
                }
                js("window.npEvent && window.npEvent('error'," + JSONObject.quote(e.errorCodeName) + ")")
            }
            override fun onCues(cueGroup: androidx.media3.common.text.CueGroup) {
                if (myGen != gen) return
                val t = cueGroup.cues.mapNotNull { it.text?.toString()?.trim()?.takeIf { x -> x.isNotEmpty() } }.joinToString("\n")
                js("window.npCue && window.npCue(" + JSONObject.quote(t) + ")")
            }
            override fun onTracksChanged(tracks: Tracks) { if (myGen == gen) js("window.npEvent && window.npEvent('tracks')") }
        })
        ensureView().player = p
        view?.visibility = android.view.View.VISIBLE
        p.setMediaItem(item, o.optLong("startMs", 0L))
        p.prepare(); p.playWhenReady = true
        player = p
        handler.removeCallbacks(ticker); handler.post(ticker)
    }

    /** Есть ли на этом ТВ аппаратный декодер VP9 (нужен для 1080p из DASH). */
    fun vp9Hw(): Boolean = try {
        android.media.MediaCodecList(android.media.MediaCodecList.ALL_CODECS).codecInfos.any { ci ->
            !ci.isEncoder && ci.supportedTypes.any { it.equals("video/x-vnd.on2.vp9", true) } &&
                (android.os.Build.VERSION.SDK_INT < 29 || ci.isHardwareAccelerated)
        }
    } catch (_: Exception) { false }

    /** Аппаратный декодер AV1 (для потоков dasha). */
    fun av1Hw(): Boolean = try {
        android.media.MediaCodecList(android.media.MediaCodecList.ALL_CODECS).codecInfos.any { ci ->
            !ci.isEncoder && ci.supportedTypes.any { it.equals("video/av01", true) } &&
                (android.os.Build.VERSION.SDK_INT < 29 || ci.isHardwareAccelerated)
        }
    } catch (_: Exception) { false }

    fun cmd(name: String, arg: Double) {
        val p = player ?: return
        when (name) {
            "toggle" -> p.playWhenReady = !p.playWhenReady
            "play" -> p.playWhenReady = true
            "pause" -> p.playWhenReady = false
            "seekTo" -> p.seekTo(arg.toLong())
            "seekBy" -> p.seekTo((p.currentPosition + arg.toLong()).coerceIn(0, if (p.duration > 0) p.duration else Long.MAX_VALUE))
            "speed" -> p.playbackParameters = PlaybackParameters(arg.toFloat())
        }
        push()
    }

    /** Звук, субтитры, качество и скорость в виде JSON для меню. */
    fun tracks(): String {
        val p = player ?: return "{}"
        val out = JSONObject()
        val audio = JSONArray(); val video = JSONArray(); val text = JSONArray()
        var ai = 0; var vi = 0; var ti = 0
        for ((gi, g) in p.currentTracks.groups.withIndex()) {
            for (t in 0 until g.length) {
                val f = g.getTrackFormat(t)
                if ((f.id ?: "").contains("failover")) continue   // запасные копии дорожек на другом CDN в меню не нужны
                when (g.type) {
                    C.TRACK_TYPE_AUDIO -> audio.put(JSONObject().put("g", gi).put("t", t).put("i", ai++).put("name", f.label ?: "").put("id", f.id ?: "").put("lang", f.language ?: "").put("sel", g.isTrackSelected(t)).put("ch", f.channelCount))
                    C.TRACK_TYPE_VIDEO -> video.put(JSONObject().put("g", gi).put("t", t).put("i", vi++).put("h", f.height).put("br", f.bitrate).put("sel", g.isTrackSelected(t)))
                    C.TRACK_TYPE_TEXT -> text.put(JSONObject().put("g", gi).put("t", t).put("i", ti++).put("name", f.label ?: "").put("lang", f.language ?: "").put("sel", g.isTrackSelected(t)))
                }
            }
        }
        out.put("audio", audio).put("video", video).put("text", text)
        out.put("speed", p.playbackParameters.speed)
        out.put("textOff", p.trackSelectionParameters.disabledTrackTypes.contains(C.TRACK_TYPE_TEXT))
        out.put("autoVideo", p.trackSelectionParameters.overrides.keys.none { it.type == C.TRACK_TYPE_VIDEO })
        return out.toString()
    }

    /** kind: audio | video | text; g, t — группа и дорожка из tracks(); g < 0 — авто (video) или выключить (text). */
    fun select(kind: String, g: Int, t: Int) {
        val p = player ?: return
        val b = p.trackSelectionParameters.buildUpon()
        val type = when (kind) { "audio" -> C.TRACK_TYPE_AUDIO; "video" -> C.TRACK_TYPE_VIDEO; else -> C.TRACK_TYPE_TEXT }
        if (g < 0) {
            if (type == C.TRACK_TYPE_TEXT) b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true) else b.clearOverridesOfType(type)
        } else {
            val group = p.currentTracks.groups.getOrNull(g) ?: return
            if (type == C.TRACK_TYPE_TEXT) b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
            b.setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, listOf(t)))
        }
        p.trackSelectionParameters = b.build()
        js("window.npEvent && window.npEvent('tracks')")
    }

    private fun push() {
        val p = player ?: return
        val d = if (p.duration == C.TIME_UNSET) 0 else p.duration
        js("window.npState && window.npState({p:${p.currentPosition},d:$d,pl:${p.isPlaying},b:${p.playbackState == Player.STATE_BUFFERING},w:${p.playWhenReady},vh:${p.videoSize.height}})")
    }

    private fun stopInternal() {
        handler.removeCallbacks(ticker)
        view?.player = null
        player?.release(); player = null
    }

    fun stop() { gen++; stopInternal(); view?.visibility = android.view.View.GONE }
    fun pause() { player?.playWhenReady = false }
    val active get() = player != null
}
