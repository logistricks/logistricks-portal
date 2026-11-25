import { timingSafeEqual } from "crypto"

/**
 * Key that signs the portal_session cookie. Set SESSION_SECRET (any long random string) so the cookie is no longer signed with the
 * database service-role key. Until it is set, the service-role key is used as before, so nothing breaks.
 * Changing SESSION_SECRET signs every user out once.
 */
export const sessionSecret = (): string => process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
