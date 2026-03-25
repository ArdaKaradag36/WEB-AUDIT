using System.Security.Cryptography;
using System.Text;

namespace WebAudit.Shared;

/// <summary>AES-GCM helper for optional encrypted job secrets (worker must share the same base64 key).</summary>
public static class JobPayloadCrypto
{
    public static byte[] EncryptUtf8(string base64Key32Bytes, string plaintext)
    {
        var key = Convert.FromBase64String(base64Key32Bytes);
        if (key.Length is not (16 or 24 or 32))
            throw new ArgumentException("Key must be 16, 24 or 32 bytes (base64-encoded).");
        var nonce = RandomNumberGenerator.GetBytes(12);
        var plain = Encoding.UTF8.GetBytes(plaintext);
        var cipher = new byte[plain.Length];
        var tag = new byte[16];
        using var aes = new AesGcm(key, 16);
        aes.Encrypt(nonce, plain, cipher, tag);
        return Combine(nonce, tag, cipher);
    }

    public static string DecryptUtf8(string base64Key32Bytes, byte[] blob)
    {
        var key = Convert.FromBase64String(base64Key32Bytes);
        if (blob.Length < 12 + 16)
            throw new InvalidOperationException("Invalid ciphertext.");
        var nonce = blob.AsSpan(0, 12).ToArray();
        var tag = blob.AsSpan(12, 16).ToArray();
        var cipher = blob.AsSpan(28).ToArray();
        var plain = new byte[cipher.Length];
        using var aes = new AesGcm(key, 16);
        aes.Decrypt(nonce, cipher, tag, plain);
        return Encoding.UTF8.GetString(plain);
    }

    private static byte[] Combine(ReadOnlySpan<byte> a, ReadOnlySpan<byte> b, ReadOnlySpan<byte> c)
    {
        var o = new byte[a.Length + b.Length + c.Length];
        a.CopyTo(o);
        b.CopyTo(o.AsSpan(a.Length));
        c.CopyTo(o.AsSpan(a.Length + b.Length));
        return o;
    }
}
