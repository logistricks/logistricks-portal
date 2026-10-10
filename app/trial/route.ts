import { TRIAL_HTML } from "@/lib/trial-page"

export const runtime = "nodejs"

/** The lead trial page (served on try.logistricks.net at "/"). The page shell is public; every action needs the trial login cookie. */
export async function GET() {
  return new Response(TRIAL_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "same-origin" },
  })
}
