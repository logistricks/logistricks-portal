/**
 * lib/web-push.ts
 * Server-only helper for sending Web Push notifications via VAPID.
 *
 * Required env vars:
 *   VAPID_PUBLIC_KEY   — base64url-encoded uncompressed EC public key
 *   VAPID_PRIVATE_KEY  — base64url-encoded EC private key
 *   VAPID_EMAIL        — contact email for push services, e.g. mailto:ops@logistricks.com
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY — same as VAPID_PUBLIC_KEY (exposed to browser)
 *
 * Generate keys once:
 *   npx web-push generate-vapid-keys
 */
import webPush from "web-push"

let configured = false

function ensureConfigured() {
  if (configured) return
  const pubKey   = process.env.VAPID_PUBLIC_KEY
  const privKey  = process.env.VAPID_PRIVATE_KEY
  const email    = process.env.VAPID_EMAIL
  if (!pubKey || !privKey || !email) {
    throw new Error("VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_EMAIL must be set")
  }
  webPush.setVapidDetails(`mailto:${email}`, pubKey, privKey)
  configured = true
}

export interface PushPayload {
  title: string
  body?: string
  url?: string
  tag?: string
}

export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<void> {
  ensureConfigured()
  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  }
  await webPush.sendNotification(pushSubscription, JSON.stringify(payload))
}
