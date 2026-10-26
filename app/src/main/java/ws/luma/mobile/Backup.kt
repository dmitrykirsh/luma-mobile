package ws.luma.mobile

import android.util.Base64
import org.json.JSONObject
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Резервная копия Luma (.luma): открытый JSON или AES-256-GCM с ключом из scrypt(пароль). */
object Backup {
    class Bad(val code: String) : Exception(code)

    /** Возвращает JSON копии с полями data и secrets, либо бросает Bad("BAD_FILE" | "BAD_PASSWORD"). */
    fun open(text: String, password: String): String {
        val file = try { JSONObject(text) } catch (e: Exception) { throw Bad("BAD_FILE") }
        val obj = if (file.optBoolean("encrypted")) {
            try {
                val key = Scrypt.derive(password.toByteArray(Charsets.UTF_8), b64(file.getString("salt")), 16384, 8, 1, 32)
                val c = Cipher.getInstance("AES/GCM/NoPadding")
                c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, b64(file.getString("iv"))))
                JSONObject(String(c.doFinal(b64(file.getString("payload")) + b64(file.getString("tag"))), Charsets.UTF_8))
            } catch (e: Exception) { throw Bad("BAD_PASSWORD") }
        } else file
        if (!Regex("^(Luma|Lift)$").matches(obj.optString("app")) || obj.optJSONObject("data") == null) throw Bad("BAD_FILE")
        return obj.toString()
    }

    private fun b64(s: String) = Base64.decode(s, Base64.DEFAULT)
    private fun b64e(b: ByteArray) = Base64.encodeToString(b, Base64.NO_WRAP)

    /** Шифрует JSON паролем: scrypt(пароль) + AES-256-GCM; тот же формат, что в Luma для Windows. */
    fun seal(plain: String, password: String): JSONObject {
        val rnd = java.security.SecureRandom()
        val salt = ByteArray(16).also { rnd.nextBytes(it) }
        val iv = ByteArray(12).also { rnd.nextBytes(it) }
        val key = Scrypt.derive(password.toByteArray(Charsets.UTF_8), salt, 16384, 8, 1, 32)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        val out = c.doFinal(plain.toByteArray(Charsets.UTF_8))
        val ct = out.copyOfRange(0, out.size - 16)
        val tag = out.copyOfRange(out.size - 16, out.size)
        return JSONObject().put("app", "Luma").put("format", 1).put("encrypted", true).put("kdf", "scrypt")
            .put("salt", b64e(salt)).put("iv", b64e(iv)).put("tag", b64e(tag)).put("payload", b64e(ct))
    }

    private fun groupKey(secret: String) = java.security.MessageDigest.getInstance("SHA-256").digest(("luma-group:" + secret).toByteArray(Charsets.UTF_8))

    /** Печать ключом группы устройств: AES-256-GCM, ключ из SHA-256. Тот же формат, что в Luma для Windows. */
    fun sealK(plain: String, secret: String): JSONObject {
        val iv = ByteArray(12).also { java.security.SecureRandom().nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(groupKey(secret), "AES"), GCMParameterSpec(128, iv))
        val out = c.doFinal(plain.toByteArray(Charsets.UTF_8))
        return JSONObject().put("app", "Luma").put("format", 2).put("encrypted", true).put("kdf", "sha256")
            .put("iv", b64e(iv)).put("tag", b64e(out.copyOfRange(out.size - 16, out.size))).put("payload", b64e(out.copyOfRange(0, out.size - 16)))
    }
    fun unsealK(file: JSONObject, secret: String): String {
        try {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, SecretKeySpec(groupKey(secret), "AES"), GCMParameterSpec(128, b64(file.getString("iv"))))
            return String(c.doFinal(b64(file.getString("payload")) + b64(file.getString("tag"))), Charsets.UTF_8)
        } catch (e: Exception) { throw Bad("BAD_KEY") }
    }

    /** Расшифровывает запечатанный объект; при неверном пароле бросает Bad("BAD_PASSWORD"). */
    fun unseal(file: JSONObject, password: String): String {
        try {
            val key = Scrypt.derive(password.toByteArray(Charsets.UTF_8), b64(file.getString("salt")), 16384, 8, 1, 32)
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, b64(file.getString("iv"))))
            return String(c.doFinal(b64(file.getString("payload")) + b64(file.getString("tag"))), Charsets.UTF_8)
        } catch (e: Exception) { throw Bad("BAD_PASSWORD") }
    }
}
