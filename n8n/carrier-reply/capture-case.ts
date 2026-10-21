// Turns a REAL carrier reply into a test case draft.
//   GEMINI_API_KEY=... npx tsx n8n/carrier-reply/capture-case.ts reply.txt [name]
// reply.txt:   first lines "From: x@y.com", "Subject: ...", optional "Date: 2026-10-01", then a blank line, then the email text
//              (paste text from a PDF/Excel attachment under a line "--- Attachment: file.pdf ---" at the end).
// It runs the model once and saves real-cases/NN-name.json with the model's answer as the DRAFT golden and "reviewed": false.
// Open the file, correct anything the model got wrong (that is the whole point), fill "expect", then set "reviewed": true.
import fs from "node:fs"
import path from "node:path"
import { extract } from "./eval-lib"

async function main() {
  const [file, nameArg] = process.argv.slice(2)
  if (!file) { console.error("usage: capture-case.ts reply.txt [name]"); process.exit(2) }
  const raw = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n")
  const split = raw.indexOf("\n\n")
  const head = raw.slice(0, split), text = raw.slice(split + 2)
  const h = (k: string) => (head.match(new RegExp(`^${k}:\\s*(.+)$`, "im")) ?? [])[1]?.trim() ?? ""
  const at = text.search(/^--- Attachment: (.+?) ---$/m)
  const attachments = at >= 0 ? [{ filename: (text.match(/^--- Attachment: (.+?) ---$/m) ?? [])[1] ?? "file", text: text.slice(at).replace(/^--- Attachment:.*---\n/, "") }] : []
  const input = { from_email: h("From"), to_email: "quotes@client.example", subject: h("Subject"), received_at: h("Date") ? new Date(h("Date")).toISOString() : new Date().toISOString(), body_text: at >= 0 ? text.slice(0, at).trim() : text.trim(), attachments, client_code: "DEMO" }
  const golden = await extract(input)
  const dir = path.join(__dirname, "real-cases")
  fs.mkdirSync(dir, { recursive: true })
  const n = String(fs.readdirSync(dir).filter((x) => x.endsWith(".json")).length + 1).padStart(2, "0")
  const out = path.join(dir, `${n}-${(nameArg || path.basename(file).replace(/\.[^.]+$/, "")).replace(/[^\w-]+/g, "-").toLowerCase()}.json`)
  fs.writeFileSync(out, JSON.stringify({ reviewed: false, note: "Draft: the golden is the model's own answer. Fix what is wrong, fill expect, then set reviewed to true.", input, golden, expect: { review_status: "auto_accepted", flags: [] } }, null, 2))
  console.log("Saved", out, "\nNow review it: every wrong value in golden is a bug the test will guard against.")
}
main().catch((e) => { console.error(e.message); process.exit(2) })
