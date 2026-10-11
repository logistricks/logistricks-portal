import type { Match } from "@/lib/carrier-match"

/** Small "Suggested" tag + one-line reason under a carrier in a picker. */
export function FitTag({ match }: { match: Match }) {
  if (match.suggested) {
    return <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: "rgb(5 150 105 / 0.12)", color: "#059669" }}>{match.fit === "both" ? "Best match" : "Suggested"}</span>
  }
  return null
}
export const fitHint = (m: Match) => m.reason
