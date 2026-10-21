// Runs the REAL model on the test emails and compares with the expected extraction. Run it after every prompt / schema / model change.
//   GEMINI_API_KEY=... npx tsx n8n/carrier-reply/eval-model.ts [--only 03] [--runs 2] [--dir real-cases]
// Cases: test-emails/*.json (synthetic) and real-cases/*.json (real replies you reviewed). Case file: { input, golden | mock_ai, expect, reviewed? }.
// A case with "reviewed": false (a draft from capture-case.ts) is skipped. Results are appended to eval-history.jsonl so you can see the trend.
import "./fake-clock"
import fs from "node:fs"
import path from "node:path"
import { buildExtendedFields } from "../../lib/quote-extended"
import { MODEL, PROMPT_HASH, buildBody, compare, extract, prepare } from "./eval-lib"

const args = process.argv.slice(2)
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined }
const only = flag("only"), runs = Math.max(1, Number(flag("runs") ?? 1)), onlyDir = flag("dir")
const dirs = ["test-emails", "real-cases"].filter((d) => !onlyDir || d === onlyDir)

async function main() {
  let total = 0, passed = 0, skipped = 0
  const rows: { case: string; ok: boolean; fails: string[] }[] = []
  for (const d of dirs) {
    const dir = path.join(__dirname, d)
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
      if (only && !f.includes(only)) continue
      const t = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))
      if (t.reviewed === false) { skipped++; console.log("skip", `${d}/${f}`, "(draft: review the golden, then set reviewed to true)"); continue }
      const golden = t.golden ?? t.mock_ai
      total++
      const fails: string[] = []
      for (let r = 0; r < runs; r++) {
        try {
          const got = await extract(t.input)
          for (const x of compare(got, golden)) if (!x.ok) fails.push(`${x.critical ? "!" : " "}${x.field}: got ${JSON.stringify(x.got)}, want ${JSON.stringify(x.want)}`)
          // end to end: model output → portal maths and checks → what the portal would show
          const prep = prepare(t.input)
          const { row, flags } = buildExtendedFields(buildBody(got, prep, MODEL))
          const e = t.expect ?? {}
          if (e.total_amount !== undefined && row.total_amount !== e.total_amount) fails.push(`!portal total: got ${row.total_amount}, want ${e.total_amount}`)
          if (e.review_status && row.review_status !== e.review_status) fails.push(`!portal review_status: got ${row.review_status}, want ${e.review_status}`)
          for (const c of e.flags ?? []) if (!flags.some((x: any) => x.code === c)) fails.push(`!portal missing flag ${c}`)
        } catch (err) { fails.push(`!error: ${(err as Error).message}`) }
      }
      const uniq = Array.from(new Set(fails))
      const ok = !uniq.some((x) => x.startsWith("!"))
      if (ok) passed++
      rows.push({ case: `${d}/${f}`, ok, fails: uniq })
      console.log(ok ? (uniq.length ? "ok* " : "ok  ") : "FAIL", `${d}/${f}`)
      for (const x of uniq) console.log("      ", x)
    }
  }
  console.log(`\n${passed}/${total} passed${skipped ? `, ${skipped} draft(s) skipped` : ""}  (model ${MODEL}, prompt ${PROMPT_HASH}, ${runs} run${runs > 1 ? "s" : ""} per case)`)
  console.log("ok* = passed, but non-critical fields differ (lines starting with a space).")
  if (!only) fs.appendFileSync(path.join(__dirname, "eval-history.jsonl"), JSON.stringify({ at: new Date().toISOString(), model: MODEL, prompt: PROMPT_HASH, runs, total, passed, failed: rows.filter((r) => !r.ok).map((r) => r.case) }) + "\n")
  process.exit(passed === total ? 0 : 1)
}
main().catch((e) => { console.error(e.message); process.exit(2) })
