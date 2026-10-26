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
 * Поиск: UDP-запрос «LUMA-DISCOVER» на порт 47810, каждая Luma с включённой синхронизацией отвечает своим именем и портом.
 * Обмен: POST /sync/exchange, данные запечатаны кодом сопряжения с экрана ТВ.
 */
class SyncNet(private val js: (String) -> Unit) {
    companion object { const val UDP_PORT = 47810 }
    private var udp: DatagramSocket? = null

    /** Отвечаем на поиск, пока открыт экран синхронизации. */
    fun startResponder(name: String, httpPort: Int) {
        stopResponder()
        Thread({
            try {
                val s = DatagramSocket(null); s.reuseAddress = true; s.bind(InetSocketAddress(UDP_PORT)); udp = s
                val buf = ByteArray(512)
                while (!s.isClosed) {
                    val p = DatagramPacket(buf, buf.size); s.receive(p)
                    if (String(p.data, 0, p.length).startsWith("LUMA-DISCOVER")) {
                        val r = JSONObject().put("app", "luma-tv").put("name", name).put("port", httpPort).toString().toByteArray()
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

    /** Ищем компьютеры: ответы собираем 2 секунды, потом отдаём список странице. */
    fun scan() {
        Thread({
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
                        if (j.optString("app") == "luma-desktop") { j.put("ip", p.address.hostAddress); found[p.address.hostAddress + ":" + j.optInt("port")] = j }
                    } catch (_: java.net.SocketTimeoutException) {} catch (_: Exception) {}
                }
                s.close()
            } catch (_: Exception) {}
            val arr = JSONArray(); found.values.forEach { arr.put(it) }
            js("window.lumaSyncFound && window.lumaSyncFound(" + JSONObject.quote(arr.toString()) + ")")
        }, "luma-scan").start()
    }

    /** Отправляем свои данные компьютеру и получаем его данные в ответ (всё запечатано кодом). */
    fun send(ip: String, port: Int, code: String, exportJson: String) {
        Thread({
            val res = JSONObject()
            try {
                val body = JSONObject().put("from", "tv").put("sealed", Backup.seal(exportJson, code)).toString().toByteArray(Charsets.UTF_8)
                val c = URL("http://$ip:$port/sync/exchange").openConnection() as HttpURLConnection
                c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 8000; c.readTimeout = 120000   // пока человек вводит код на компьютере
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
}
