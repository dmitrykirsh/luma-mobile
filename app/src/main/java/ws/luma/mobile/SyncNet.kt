package ws.luma.mobile

import org.json.JSONArray
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.URL

/**
 * Поиск Luma на других устройствах в домашней сети и обмен данными.
 * Поиск: UDP-запрос «LUMA-DISCOVER» на порт 47810, каждая Luma отвечает именем, портом, номером группы (grp) и номером устройства (did).
 * Первое подключение: POST /sync/exchange, данные запечатаны кодом сопряжения с экрана устройства; заодно устройства получают общий ключ группы.
 * Дальше без кодов: POST /sync/v2, данные запечатаны ключом группы (AES-GCM, ключ из SHA-256).
 */
class SyncNet(private val js: (String) -> Unit) {
    companion object { const val UDP_PORT = 47810 }
    private var udp: DatagramSocket? = null
    @Volatile var gid: String = ""
    @Volatile var did: String = ""

    /** Отвечаем на поиск, пока приложение открыто. */
    fun startResponder(name: String, httpPort: Int) {
        stopResponder()
        Thread({
            try {
                val s = DatagramSocket(null); s.reuseAddress = true; s.bind(InetSocketAddress(UDP_PORT)); udp = s
                val buf = ByteArray(512)
                while (!s.isClosed) {
                    val p = DatagramPacket(buf, buf.size); s.receive(p)
                    if (String(p.data, 0, p.length).startsWith("LUMA-DISCOVER")) {
                        val r = JSONObject().put("app", "luma-tv").put("name", name).put("port", httpPort).put("grp", gid).put("did", did).toString().toByteArray()
                        s.send(DatagramPacket(r, r.size, p.address, p.port))
                    }
                }
            } catch (_: Exception) {}
        }, "luma-udp").start()
    }

    fun stopResponder() { try { udp?.close() } catch (_: Exception) {}; udp = null }

    private fun broadcasts(): List<InetAddress> {
        val out = ArrayList<InetAddress>()
        try { out.add(InetAddress.getByName("255.255.255.255")) } catch (_: Exception) {}
        try {
            for (n in NetworkInterface.getNetworkInterfaces()) {
                if (!n.isUp || n.isLoopback) continue
                for (a in n.interfaceAddresses) a.broadcast?.let { out.add(it) }
            }
        } catch (_: Exception) {}
        return out.distinct()
    }

    /** Ищем другие Luma в сети (блокирующий вызов, около 2 секунд): компьютеры и устройства с Luma TV или телефонной Luma, кроме себя. */
    fun scanPeers(): List<JSONObject> {
        val found = LinkedHashMap<String, JSONObject>()
        try {
            val s = DatagramSocket(); s.broadcast = true; s.soTimeout = 400
            val msg = "LUMA-DISCOVER 1".toByteArray()
            repeat(3) { for (b in broadcasts()) try { s.send(DatagramPacket(msg, msg.size, b, UDP_PORT)) } catch (_: Exception) {} }
            val end = System.currentTimeMillis() + 2200
            val buf = ByteArray(1024)
            while (System.currentTimeMillis() < end) {
                try {
                    val p = DatagramPacket(buf, buf.size); s.receive(p)
                    val j = JSONObject(String(p.data, 0, p.length))
                    val app = j.optString("app")
                    if ((app == "luma-desktop" || app == "luma-tv") && !(did.isNotEmpty() && j.optString("did") == did)) { j.put("ip", p.address.hostAddress); found[p.address.hostAddress + ":" + j.optInt("port")] = j }
                } catch (_: java.net.SocketTimeoutException) {} catch (_: Exception) {}
            }
            s.close()
        } catch (_: Exception) {}
        return found.values.toList()
    }

    /** Поиск для экрана подключения: список устройств, к которым можно подключиться по коду. */
    fun scan() {
        Thread({
            val arr = JSONArray(); scanPeers().forEach { arr.put(it) }
            js("window.lumaSyncFound && window.lumaSyncFound(" + JSONObject.quote(arr.toString()) + ")")
        }, "luma-scan").start()
    }

    /** Первое подключение: отправляем свои данные устройству и получаем его данные в ответ (всё запечатано кодом). */
    fun send(ip: String, port: Int, code: String, exportJson: String) {
        Thread({
            val res = JSONObject()
            try {
                val body = JSONObject().put("from", "tv").put("sealed", Backup.seal(exportJson, code)).toString().toByteArray(Charsets.UTF_8)
                val c = URL("http://$ip:$port/sync/exchange").openConnection() as HttpURLConnection
                c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 8000; c.readTimeout = 120000   // пока человек вводит код на втором устройстве
                c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.use { it.write(body) }
                val txt = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().readText()
                val j = JSONObject(txt)
                if (j.optBoolean("ok")) res.put("ok", true).put("name", j.optString("name")).put("data", Backup.unseal(j.getJSONObject("sealed"), code))
                else res.put("error", j.optString("error", "ERR"))
            } catch (e: java.net.SocketTimeoutException) { res.put("error", "TIMEOUT") } catch (e: Exception) { res.put("error", "NETWORK") }
            js("window.lumaSyncDone && window.lumaSyncDone(" + JSONObject.quote(res.toString()) + ")")
        }, "luma-send").start()
    }

    /** Обмен без кода: находим устройства своей группы, отдаём им свои данные и забираем их (блокирующий вызов). */
    fun autoExchange(gkey: String, exportJson: String): JSONArray {
        val out = JSONArray()
        if (gid.isEmpty() || gkey.isEmpty()) return out
        for (p in scanPeers()) {
            if (p.optString("grp") != gid) continue
            val r = JSONObject().put("name", p.optString("name")).put("ip", p.optString("ip")).put("did", p.optString("did"))
            try {
                val body = JSONObject().put("gid", gid).put("from", did).put("sealed", Backup.sealK(exportJson, gkey)).toString().toByteArray(Charsets.UTF_8)
                val c = URL("http://${p.optString("ip")}:${p.optInt("port")}/sync/v2").openConnection() as HttpURLConnection
                c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 4000; c.readTimeout = 40000
                c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.use { it.write(body) }
                val txt = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().readText()
                val j = JSONObject(txt)
                if (j.optBoolean("ok")) r.put("ok", true).put("data", Backup.unsealK(j.getJSONObject("sealed"), gkey)) else r.put("error", j.optString("error", "ERR"))
            } catch (e: java.net.SocketTimeoutException) { r.put("error", "TIMEOUT") } catch (e: Exception) { r.put("error", "NETWORK") }
            out.put(r)
        }
        return out
    }

    fun autoAsync(gkey: String, exportJson: String) {
        Thread({
            val res = try { autoExchange(gkey, exportJson) } catch (_: Exception) { JSONArray() }
            js("window.lumaSyncAuto && window.lumaSyncAuto(" + JSONObject.quote(res.toString()) + ")")
        }, "luma-auto").start()
    }
}
