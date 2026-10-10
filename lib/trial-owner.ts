/** Only the Logistricks owner may manage trial leads (they are not client data, so client admins must never see them).
 *  Set TRIAL_OWNERS in Vercel as a comma-separated list of CLIENTCODE/username, e.g. DIPEX/azeez. Unset = nobody. */
export function isTrialOwner(clientCode: string | null | undefined, username: string | null | undefined): boolean {
  const list = (process.env.TRIAL_OWNERS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (!list.length || !clientCode || !username) return false
  return list.includes(`${clientCode}/${username}`.toLowerCase())
}
