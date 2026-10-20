// Rebuilds 40-trial-request-email.json (workflow "40 · Trial · Request email") so the trial reads a request the way production does.
// Run: node build-40.js   then import the JSON into n8n (replace workflow 40, keep the same webhook path).
//   - Step 1 uses the live request extraction prompt (node-build-extraction.js, taken from workflow 20).
//   - Step 2 (rfq-prompt.md) adds port_warning, rfq_subject and rfq_body.
const fs = require("fs")
const path = require("path")
const f = path.join(__dirname, "40-trial-request-email.json")
const wf = JSON.parse(fs.readFileSync(f, "utf8"))
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error("missing node: " + name); return n }

node("Build extraction input").parameters.jsCode = fs.readFileSync(path.join(__dirname, "node-build-extraction.js"), "utf8")

const rfqSystem = fs.readFileSync(path.join(__dirname, "rfq-prompt.md"), "utf8").split("```")[1].replace(/^\n/, "").trim()
node("Build checks input").parameters.jsCode = `const SYSTEM = ${JSON.stringify(rfqSystem)}
const SCHEMA = ${JSON.stringify({ type: "OBJECT", properties: { port_warning: { type: "STRING", nullable: true }, rfq_subject: { type: "STRING" }, rfq_body: { type: "STRING" } }, required: ["port_warning", "rfq_subject", "rfq_body"] })}
const prev = $input.first().json
const parts = [{ text: 'Client email:\\n' + prev.email_text + '\\n\\nExtracted data:\\n' + JSON.stringify(prev.ai) }]
return [{ json: { system: SYSTEM, schema: SCHEMA, parts, ai: prev.ai } }]`

const old = node("Check missing info and draft reply")
old.name = "Check ports and draft RFQ"
for (const c of Object.values(wf.connections)) for (const out of c.main) for (const l of out) if (l.node === "Check missing info and draft reply") l.node = "Check ports and draft RFQ"
wf.connections["Check ports and draft RFQ"] = wf.connections["Check missing info and draft reply"]; delete wf.connections["Check missing info and draft reply"]

node("Shape answer").parameters.jsCode = `const r = $input.first().json.ai || {}
const extraction = $('Keep extraction').first().json.ai
// missing items are worked out in the portal from the shipment type's required fields; the reply comes from the same prompt as production
return [{ json: { ok: true, extraction, suggested_reply: extraction.suggested_reply || null, port_warning: r.port_warning || null, rfq_subject: r.rfq_subject || null, rfq_body: r.rfq_body || null, language: extraction.language || null } }]`

node("Read me").parameters.content = "40 · Trial · Request email\n\nUsed by the portal's trial page (/webhook/trial-request).\nReads a pasted freight request the way production does (same extraction prompt as 20 · Core · Request intake), then writes the carrier RFQ and a port check. Nothing is saved.\n\nChecks the 'Portal secret' header on the webhook itself.\nGemini work is done by '00 · Shared · Gemini call'.\nRebuild from the repo: n8n/trial/build-40.js"
fs.writeFileSync(f, JSON.stringify(wf, null, 2) + "\n")
console.log("written", f)
