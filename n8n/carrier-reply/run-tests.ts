// Local check (no n8n, no network): prepare → mock model output → build body → server maths → compare with expectations.
// Run from repo root:  npx tsx n8n/carrier-reply/run-tests.ts
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { buildExtendedFields } from "../../lib/quote-extended"

const require = createRequire(import.meta.url)
const { prepare } = require("./prepare.js")
const { buildBody } = require("./build-body.js")
const dir = path.join(__dirname, "test-emails")
let fail = 0
for (const f of fs.readdirSync(dir).sort()) {
  const t = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))
  const prep = prepare(t.input)
  const body = buildBody(t.mock_ai, prep, "mock")
  const { row, flags } = buildExtendedFields(body)
  const codes = flags.map((x: any) => x.code)
  const e = t.expect, errs: string[] = []
  const eq = (k: string, got: unknown, want: unknown) => { if (want !== undefined && got !== want) errs.push(`${k}: got ${got}, want ${want}`) }
  if (/^On .*wrote:/m.test(prep.fresh_text) || /^>/m.test(prep.fresh_text)) errs.push("quoted text not stripped")
  if (!e.linked === false && !prep.rfq_reference && f !== "10-unknown-sender-mixed-currency.json") errs.push("RFQ token not found")
  eq("chargeable_weight", row.chargeable_weight, e.chargeable_weight)
  eq("chargeable_unit", row.chargeable_unit, e.chargeable_unit)
  eq("chargeable_basis", row.chargeable_basis, e.chargeable_basis)
  eq("total_amount", row.total_amount, e.total_amount)
  eq("validity_date", body.validity_date, e.validity_date)
  eq("review_status", row.review_status, e.review_status)
  for (const c of e.flags ?? []) if (!codes.includes(c)) errs.push(`missing flag ${c}`)
  if ((e.flags ?? []).length === 0 && codes.length) errs.push(`unexpected flags ${codes}`)
  console.log(errs.length ? "FAIL" : "ok  ", f, errs.length ? errs.join("; ") : `[${codes.join(",")}] ${row.review_status}`)
  if (errs.length) fail++
}
process.exit(fail ? 1 : 0)
