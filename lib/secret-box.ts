/**
 * lib/secret-box.ts  (server only)
 * Encrypts small secrets (e.g. an SMTP password) before they are stored. AES-256-GCM.
 * The key comes from SMTP_ENCRYPTION_KEY, falling back to the service-role key so no extra setup is needed.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"

function key(): Buffer {
  const secret = process.env.SMTP_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error("No encryption key available")
  return createHash("sha256").update(`logistricks-secret-box:${secret}`).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv("aes-256-gcm", key(), iv)
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()])
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":")
}

export function decryptSecret(box: string | null | undefined): string {
  if (!box) return ""
  const [v, iv, tag, data] = box.split(":")
  if (v !== "v1" || !iv || !tag || !data) return ""
  try {
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"))
    d.setAuthTag(Buffer.from(tag, "base64"))
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8")
  } catch {
    return "" // key changed or data corrupted — the admin has to re-enter the password
  }
}
