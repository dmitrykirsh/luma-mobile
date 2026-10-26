package ws.luma.mobile

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** scrypt (RFC 7914). Нужен, чтобы открыть резервную копию, которую Luma для Windows шифрует паролем. */
object Scrypt {
    fun derive(pass: ByteArray, salt: ByteArray, n: Int, r: Int, p: Int, dkLen: Int): ByteArray {
        val b = pbkdf2(pass, salt, p * 128 * r)
        val v = IntArray(32 * r * n)
        for (i in 0 until p) smix(b, i * 128 * r, r, n, v)
        return pbkdf2(pass, b, dkLen)
    }

    // PBKDF2-HMAC-SHA256 с одной итерацией
    private fun pbkdf2(pass: ByteArray, salt: ByteArray, len: Int): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(pass, "HmacSHA256"))
        val out = ByteArray(len)
        var pos = 0
        var i = 1
        while (pos < len) {
            mac.update(salt)
            mac.update(byteArrayOf((i ushr 24).toByte(), (i ushr 16).toByte(), (i ushr 8).toByte(), i.toByte()))
            val t = mac.doFinal()
            val c = minOf(t.size, len - pos)
            System.arraycopy(t, 0, out, pos, c)
            pos += c; i++
        }
        return out
    }

    private fun smix(b: ByteArray, bi: Int, r: Int, n: Int, v: IntArray) {
        val words = 32 * r
        val x = IntArray(words)
        for (i in 0 until words) {
            val o = bi + i * 4
            x[i] = (b[o].toInt() and 255) or ((b[o + 1].toInt() and 255) shl 8) or
                ((b[o + 2].toInt() and 255) shl 16) or ((b[o + 3].toInt() and 255) shl 24)
        }
        val y = IntArray(words)
        for (i in 0 until n) {
            System.arraycopy(x, 0, v, i * words, words)
            blockMix(x, y, r)
        }
        for (i in 0 until n) {
            val j = x[(2 * r - 1) * 16] and (n - 1)
            for (k in 0 until words) x[k] = x[k] xor v[j * words + k]
            blockMix(x, y, r)
        }
        for (i in 0 until words) {
            val o = bi + i * 4
            b[o] = x[i].toByte(); b[o + 1] = (x[i] ushr 8).toByte(); b[o + 2] = (x[i] ushr 16).toByte(); b[o + 3] = (x[i] ushr 24).toByte()
        }
    }

    private fun blockMix(b: IntArray, y: IntArray, r: Int) {
        val x = IntArray(16)
        System.arraycopy(b, (2 * r - 1) * 16, x, 0, 16)
        for (i in 0 until 2 * r) {
            for (j in 0 until 16) x[j] = x[j] xor b[i * 16 + j]
            salsa8(x)
            System.arraycopy(x, 0, y, i * 16, 16)
        }
        for (i in 0 until r) System.arraycopy(y, 2 * i * 16, b, i * 16, 16)
        for (i in 0 until r) System.arraycopy(y, (2 * i + 1) * 16, b, (i + r) * 16, 16)
    }

    private fun rotl(a: Int, b: Int) = (a shl b) or (a ushr (32 - b))

    private fun salsa8(b: IntArray) {
        val x = b.copyOf(16)
        repeat(4) {
            x[4] = x[4] xor rotl(x[0] + x[12], 7); x[8] = x[8] xor rotl(x[4] + x[0], 9)
            x[12] = x[12] xor rotl(x[8] + x[4], 13); x[0] = x[0] xor rotl(x[12] + x[8], 18)
            x[9] = x[9] xor rotl(x[5] + x[1], 7); x[13] = x[13] xor rotl(x[9] + x[5], 9)
            x[1] = x[1] xor rotl(x[13] + x[9], 13); x[5] = x[5] xor rotl(x[1] + x[13], 18)
            x[14] = x[14] xor rotl(x[10] + x[6], 7); x[2] = x[2] xor rotl(x[14] + x[10], 9)
            x[6] = x[6] xor rotl(x[2] + x[14], 13); x[10] = x[10] xor rotl(x[6] + x[2], 18)
            x[3] = x[3] xor rotl(x[15] + x[11], 7); x[7] = x[7] xor rotl(x[3] + x[15], 9)
            x[11] = x[11] xor rotl(x[7] + x[3], 13); x[15] = x[15] xor rotl(x[11] + x[7], 18)
            x[1] = x[1] xor rotl(x[0] + x[3], 7); x[2] = x[2] xor rotl(x[1] + x[0], 9)
            x[3] = x[3] xor rotl(x[2] + x[1], 13); x[0] = x[0] xor rotl(x[3] + x[2], 18)
            x[6] = x[6] xor rotl(x[5] + x[4], 7); x[7] = x[7] xor rotl(x[6] + x[5], 9)
            x[4] = x[4] xor rotl(x[7] + x[6], 13); x[5] = x[5] xor rotl(x[4] + x[7], 18)
            x[11] = x[11] xor rotl(x[10] + x[9], 7); x[8] = x[8] xor rotl(x[11] + x[10], 9)
            x[9] = x[9] xor rotl(x[8] + x[11], 13); x[10] = x[10] xor rotl(x[9] + x[8], 18)
            x[12] = x[12] xor rotl(x[15] + x[14], 7); x[13] = x[13] xor rotl(x[12] + x[15], 9)
            x[14] = x[14] xor rotl(x[13] + x[12], 13); x[15] = x[15] xor rotl(x[14] + x[13], 18)
        }
        for (i in 0 until 16) b[i] += x[i]
    }
}
