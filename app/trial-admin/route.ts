import { TRIAL_ADMIN_HTML } from "@/lib/trial-admin-page"

export const runtime = "nodejs"

/** Owner console shell (served on try.logistricks.com/admin). Every data request needs the owner login cookie. */
export async function GET() {
  return new Response(TRIAL_ADMIN_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" } })
}
