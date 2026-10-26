package ws.luma.mobile

import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.net.ServerSocket
import java.net.Socket
import java.security.SecureRandom

/**
 * Крошечный HTTP-сервер для переноса резервной копии с телефона: ТВ показывает QR со ссылкой,
 * телефон открывает страницу, выбирает файл .luma, вводит пароль и отправляет. Ссылка содержит
 * одноразовый код, сервер работает только пока открыт экран импорта.
 */
class ImportServer(private val onData: (String) -> Unit, private val onError: (String) -> Unit, private val onPlaylist: (String) -> Unit = {}) {
    private var server: ServerSocket? = null
    val pin = (100000 + SecureRandom().nextInt(900000)).toString()
    var port = 0; private set

    // синхронизация с компьютером: код сопряжения, наши данные для ответа и что делать с полученными
    @Volatile var syncCode: String? = null
    @Volatile var groupId: String = ""
    @Volatile var groupKey: String = ""
    @Volatile var syncExport: String = "{}"
    @Volatile var deviceName: String = ""
    @Volatile var onSyncIn: (String) -> Unit = {}

    fun start(): Int {
        var s: ServerSocket? = null
        for (p in 8765..8785) { try { s = ServerSocket(p); break } catch (_: Exception) {} }
        val sock = s ?: throw IllegalStateException("no port")
        server = sock; port = sock.localPort
        Thread({ while (!sock.isClosed) { try { val c = sock.accept(); Thread { handle(c) }.start() } catch (_: Exception) {} } }, "luma-import").start()
        return port
    }

    fun stop() { try { server?.close() } catch (_: Exception) {}; server = null }

    private fun handle(c: Socket) {
        try {
            c.soTimeout = 15000
            val inp = BufferedInputStream(c.getInputStream())
            val head = readHead(inp) ?: return
            val lines = head.split("\r\n")
            val first = lines[0].split(" ")
            val method = first[0]
            val target = first.getOrElse(1) { "/" }
            val len = lines.firstOrNull { it.startsWith("Content-Length:", true) }?.substringAfter(":")?.trim()?.toIntOrNull() ?: 0
            val q = target.substringAfter("?", "")
            val path = target.substringBefore("?")
            val out = c.getOutputStream()
            if (path == "/sync/info") { reply(out, 200, "application/json", JSONObject().put("app", "luma-tv").put("name", deviceName).toString()); return }
            if (path == "/sync/exchange" && method == "POST") { syncExchange(inp, len, out); return }
            if (path == "/sync/v2" && method == "POST") { syncV2(inp, len, out); return }
            val okPin = Regex("(^|&)k=$pin($|&)").containsMatchIn(q)
            if (!okPin) { reply(out, 403, "text/plain; charset=utf-8", "Ссылка устарела. Откройте QR на экране ТВ заново."); return }
            if (method == "GET") { reply(out, 200, "text/html; charset=utf-8", if (Regex("(^|&)m=pl($|&)").containsMatchIn(q)) PAGE_PL else PAGE); return }
            if (method == "POST" && len in 1..(12 * 1024 * 1024)) {
                val buf = ByteArray(len); var n = 0
                while (n < len) { val r = inp.read(buf, n, len - n); if (r < 0) break; n += r }
                val j = JSONObject(String(buf, 0, n, Charsets.UTF_8))
                if (j.optString("kind") == "pl") {
                    val u = j.optString("url").trim()
                    if (!Regex("""^https?://\S+${'$'}""", RegexOption.IGNORE_CASE).matches(u)) { reply(out, 200, "application/json", "{\"error\":\"BAD_URL\"}"); return }
                    reply(out, 200, "application/json", "{\"ok\":true}")
                    onPlaylist(JSONObject().put("name", j.optString("name").trim().take(60)).put("url", u).toString())
                    return
                }
                try {
                    val plain = Backup.open(j.getString("file"), j.optString("password"))
                    reply(out, 200, "application/json", "{\"ok\":true}")
                    onData(plain)
                } catch (e: Backup.Bad) {
                    reply(out, 200, "application/json", "{\"error\":\"" + e.code + "\"}")
                    onError(e.code)
                }
                return
            }
            reply(out, 400, "text/plain; charset=utf-8", "bad request")
        } catch (_: Exception) {
        } finally { try { c.close() } catch (_: Exception) {} }
    }

    /** Приём данных от компьютера: тело запечатано кодом сопряжения; в ответ отдаём свои данные, запечатанные тем же кодом. */
    private fun syncExchange(inp: BufferedInputStream, len: Int, out: java.io.OutputStream) {
        val code = syncCode
        if (code == null || len !in 1..(24 * 1024 * 1024)) { reply(out, 403, "application/json", "{\"error\":\"NOT_READY\"}"); return }
        val buf = ByteArray(len); var n = 0
        while (n < len) { val r = inp.read(buf, n, len - n); if (r < 0) break; n += r }
        try {
            val j = JSONObject(String(buf, 0, n, Charsets.UTF_8))
            val plain = Backup.unseal(j.getJSONObject("sealed"), code)
            val resp = JSONObject().put("ok", true).put("name", deviceName).put("sealed", Backup.seal(syncExport, code))
            reply(out, 200, "application/json", resp.toString())
            onSyncIn(plain)
        } catch (e: Backup.Bad) { reply(out, 200, "application/json", "{\"error\":\"BAD_CODE\"}") }
        catch (e: Exception) { reply(out, 400, "application/json", "{\"error\":\"BAD_REQUEST\"}") }
    }

    /** Обмен без кода: тело запечатано ключом группы; отвечаем своими данными, запечатанными тем же ключом. */
    private fun syncV2(inp: BufferedInputStream, len: Int, out: java.io.OutputStream) {
        val key = groupKey
        if (groupId.isEmpty() || key.isEmpty() || len !in 1..(24 * 1024 * 1024)) { reply(out, 200, "application/json", "{\"error\":\"NO_GROUP\"}"); return }
        val buf = ByteArray(len); var n = 0
        while (n < len) { val r = inp.read(buf, n, len - n); if (r < 0) break; n += r }
        try {
            val j = JSONObject(String(buf, 0, n, Charsets.UTF_8))
            if (j.optString("gid") != groupId) { reply(out, 200, "application/json", "{\"error\":\"OTHER_GROUP\"}"); return }
            val plain = Backup.unsealK(j.getJSONObject("sealed"), key)
            val resp = JSONObject().put("ok", true).put("name", deviceName).put("sealed", Backup.sealK(syncExport, key))
            reply(out, 200, "application/json", resp.toString())
            onSyncIn(plain)
        } catch (e: Backup.Bad) { reply(out, 200, "application/json", "{\"error\":\"BAD_KEY\"}") }
        catch (e: Exception) { reply(out, 400, "application/json", "{\"error\":\"BAD_REQUEST\"}") }
    }

    private fun readHead(inp: BufferedInputStream): String? {
        val b = ByteArrayOutputStream()
        var tail = 0
        while (b.size() < 16384) {
            val x = inp.read(); if (x < 0) return null
            b.write(x)
            tail = (tail shl 8) or x
            if (tail == 0x0d0a0d0a) return String(b.toByteArray(), Charsets.ISO_8859_1)
        }
        return null
    }

    private fun reply(out: java.io.OutputStream, code: Int, type: String, body: String) {
        val data = body.toByteArray(Charsets.UTF_8)
        out.write(("HTTP/1.1 $code OK\r\nContent-Type: $type\r\nContent-Length: ${data.size}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n").toByteArray())
        out.write(data); out.flush()
    }

    companion object {
        private val PAGE_PL = """<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Luma · плейлист каналов</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#0B0C10;color:#F8F9FA;font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;padding:20px}
.c{width:100%;max-width:420px;background:#181A20;border:1px solid rgba(248,249,250,.09);border-radius:20px;padding:26px}
h1{margin:0 0 6px;font-size:22px}p{margin:0 0 18px;color:#8E95A5;font-size:14px}
label{display:block;margin:14px 0 6px;font-size:13px;color:#8E95A5}
input{width:100%;padding:13px;border-radius:12px;border:1px solid rgba(248,249,250,.14);background:#0B0C10;color:#F8F9FA;font-size:16px}
button{margin-top:22px;width:100%;padding:15px;border:0;border-radius:12px;background:linear-gradient(135deg,#FF3366,#FF4F7E);color:#fff;font-size:16px;font-weight:600}
button:disabled{opacity:.5}#m{margin-top:16px;font-size:14px;min-height:20px}.e{color:#FF6B8A}.o{color:#5EE29A}</style></head><body><div class="c">
<h1>Плейлист каналов</h1><p>Вставьте ссылку на плейлист M3U/M3U8: каналы появятся в разделе «Каналы» на ТВ.</p>
<label>Название (необязательно)</label><input id="n" autocomplete="off">
<label>Ссылка на плейлист</label><input id="u" type="url" placeholder="https://..." autocomplete="off">
<button id="b">Добавить на ТВ</button><div id="m"></div></div>
<script>
const m=document.getElementById('m'),b=document.getElementById('b');
b.onclick=async()=>{const u=document.getElementById('u').value.trim();if(!/^https?:\/\//i.test(u)){m.className='e';m.textContent='Нужна ссылка вида https://…';return}
b.disabled=true;m.className='';m.textContent='Отправляем…';
try{const r=await fetch(location.href,{method:'POST',body:JSON.stringify({kind:'pl',name:document.getElementById('n').value,url:u})});const j=await r.json();
if(j.ok){m.className='o';m.textContent='Готово! ТВ проверяет плейлист — можно закрыть страницу.'}else{m.className='e';m.textContent='Ссылка не подошла.';b.disabled=false}}
catch(e){m.className='e';m.textContent='Не получилось отправить. Телефон и ТВ должны быть в одной Wi-Fi сети.';b.disabled=false}};
</script></body></html>"""
        private val PAGE = """<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Luma · перенос данных</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#0B0C10;color:#F8F9FA;font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;padding:20px}
.c{width:100%;max-width:420px;background:#181A20;border:1px solid rgba(248,249,250,.09);border-radius:20px;padding:26px}
h1{margin:0 0 6px;font-size:22px}p{margin:0 0 18px;color:#8E95A5;font-size:14px}
label{display:block;margin:14px 0 6px;font-size:13px;color:#8E95A5}
input[type=password],input[type=file]{width:100%;padding:13px;border-radius:12px;border:1px solid rgba(248,249,250,.14);background:#0B0C10;color:#F8F9FA;font-size:16px}
button{margin-top:22px;width:100%;padding:15px;border:0;border-radius:12px;background:linear-gradient(135deg,#FF3366,#FF4F7E);color:#fff;font-size:16px;font-weight:600}
button:disabled{opacity:.5}#m{margin-top:16px;font-size:14px;min-height:20px}.e{color:#FF6B8A}.o{color:#5EE29A}</style></head><body><div class="c">
<h1>Luma на ТВ</h1><p>Выберите файл резервной копии (.luma), сохранённый в Luma для Windows. Если файл защищён паролем, введите его. Данные уйдут только на ваш телевизор по домашней сети.</p>
<label>Файл копии</label><input id="f" type="file">
<label>Пароль (если задавали)</label><input id="p" type="password" autocomplete="off">
<button id="b">Отправить на ТВ</button><div id="m"></div></div>
<script>
const m=document.getElementById('m'),b=document.getElementById('b');
b.onclick=async()=>{const f=document.getElementById('f').files[0];if(!f){m.className='e';m.textContent='Сначала выберите файл';return}
b.disabled=true;m.className='';m.textContent='Отправляем…';
try{const t=await f.text();const r=await fetch(location.href,{method:'POST',body:JSON.stringify({file:t,password:document.getElementById('p').value})});const j=await r.json();
if(j.ok){m.className='o';m.textContent='Готово! Данные уже на ТВ — можно закрыть страницу.'}
else{m.className='e';m.textContent=j.error==='BAD_PASSWORD'?'Пароль не подошёл. Проверьте и попробуйте ещё раз.':'Это не похоже на копию Luma.';b.disabled=false}}
catch(e){m.className='e';m.textContent='Не получилось отправить. Телефон и ТВ должны быть в одной Wi-Fi сети.';b.disabled=false}};
</script></body></html>"""
    }
}
