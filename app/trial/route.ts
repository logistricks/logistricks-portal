import type { NextRequest } from "next/server"
import { TRIAL_HTML } from "@/lib/trial-page"
import { TRIAL_HTML_CLASSIC } from "@/lib/trial-page-classic"

export const runtime = "nodejs"

/**
 * The lead trial page (served on try.logistricks.net at "/"). The page shell is public; every action needs the trial login cookie.
 * The guided look is the default. The previous look is kept: add ?ui=classic, or set TRIAL_UI=classic to make it the default.
 */
export async function GET(req: NextRequest) {
  const ui = new URL(req.url).searchParams.get("ui") ?? process.env.TRIAL_UI ?? ""
  return new Response(ui === "classic" ? TRIAL_HTML_CLASSIC : TRIAL_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "same-origin" },
  })
}
