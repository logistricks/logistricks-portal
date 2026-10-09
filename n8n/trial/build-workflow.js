// Generates the two trial workflows. Run: node build-workflow.js
// The extraction prompts and schemas are read from the existing request-intake and carrier-reply folders, unchanged.
const fs = require("fs")
const path = require("path")
const rd = (...p) => fs.readFileSync(path.join(__dirname, ...p), "utf8")
const reqSchema = JSON.parse(rd("..", "request-intake", "response-schema.json"))
const reqSystem = rd("..", "request-intake", "extraction-prompt.md").split("```")[1].replace(/^\n/, "").trim()
const qSchema = JSON.parse(rd("..", "carrier-reply", "response-schema.json"))
const qSystem = rd("..", "carrier-reply", "extraction-prompt.md").split("```")[1].replace(/^\n/, "").trim()
const replySystem = rd("reply-prompt.md").split("```")[1].replace(/^\n/, "").trim()
const replySchema = {
  type: "OBJECT",
  properties: {
    missing: { type: "ARRAY", items: { type: "STRING" } },
    suggested_reply: { type: "STRING", nullable: true },
    port_warning: { type: "STRING", nullable: true },
    language: { type: "STRING" },
  },
  required: ["missing", "suggested_reply", "port_warning", "language"],
}

const configCode = `// Edit the values below. (n8n blocks environment variables in nodes by default, so settings live here.)
const cfg = {
  portal_secret: 'CHANGE_ME',   // same value as PORTAL_WEBHOOK_SECRET in Vercel
  gemini_key: 'CHANGE_ME',
  gemini_model: 'gemini-3.6-flash',
}
return [{ json: { ...$input.first().json, cfg } }]`

// Shared Gemini caller (same retry and tolerant-JSON pattern as the existing workflows).
const geminiFn = (system, schema, textExpr, extra = "") => `const cfg = $('Config').first().json.cfg
const SYSTEM = ${JSON.stringify(system)}
const SCHEMA = ${JSON.stringify(schema)}
${textExpr}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + cfg.gemini_model + ':generateContent?key=' + cfg.gemini_key
async function call(attempt, useSchema) {
  const gen = { temperature: 0, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } }
  if (useSchema) gen.responseSchema = SCHEMA
  const system = useSchema ? SYSTEM : SYSTEM + '\\n\\nReturn JSON with exactly these fields (schema): ' + JSON.stringify(SCHEMA)
  try {
    const response = await this.helpers.httpRequest({
      method: 'POST', url, headers: { 'Content-Type': 'application/json' }, json: true,
      body: { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }], generationConfig: gen },
    })
    if (!response.candidates) throw new Error('No candidates returned: ' + JSON.stringify(response))
    const aiText = response.candidates[0].content.parts[0].text
    let ai
    try { ai = JSON.parse(aiText) } catch (e) { ai = JSON.parse(aiText.replace(/\`\`\`json|\`\`\`/g, '').trim()) }
    return ai
  } catch (e) {
    const msg = e.message || String(e)
    if (attempt >= 3) throw new Error('Gemini failed after ' + attempt + ' attempts: ' + msg)
    await sleep(msg.includes('429') ? attempt * 6000 : attempt * 3000)
    return call.call(this, attempt + 1, useSchema && !/400|schema|responseSchema/i.test(msg))
  }
}
${extra}`

const AUTH = `const item = $input.first().json
const b = item.body || item
const secret = (item.headers && (item.headers['x-portal-secret'] || item.headers['X-Portal-Secret'])) || ''
if (!item.cfg || !item.cfg.portal_secret || secret !== item.cfg.portal_secret) return [{ json: { unauthorized: true } }]`
const FILES = `const files = (b.attachments || [])
  .filter((a) => a && a.data_base64 && /^(application\\/pdf|image\\/(png|jpe?g|webp))$/i.test(String(a.mime_type || '')) && String(a.data_base64).length < 8000000)
  .slice(0, 4)
  .map((a) => ({ filename: a.filename || 'file', mime_type: String(a.mime_type).toLowerCase(), data: String(a.data_base64).replace(/^data:[^,]*,/, '') }))`

const reqPrepare = `${AUTH}
const text = String(b.body_text || '').trim()
if (!text && !(b.attachments || []).length) return [{ json: { bad_request: 'body_text or an attachment is required' } }]
${FILES}
return [{ json: { subject: b.subject || '', received_at: new Date().toISOString(), fresh_text: text.slice(0, 20000), files } }]`

const reqGemini = geminiFn(reqSystem, reqSchema,
`const p = $input.first().json
const text = 'Freight request email\\nFrom:  <>\\nSubject: ' + p.subject + '\\nReceived: ' + p.received_at + '\\n\\n' + p.fresh_text
const parts = [{ text: text + (p.files.length ? '\\n\\nAttached files (read them): ' + p.files.map((f) => f.filename).join(', ') : '') }]
for (const f of p.files) parts.push({ inline_data: { mime_type: f.mime_type, data: f.data } })`,
`const ai = await call.call(this, 1, true)
return [{ json: { ai, email_text: p.fresh_text, files_count: p.files.length } }]`)

const replyGemini = geminiFn(replySystem, replySchema,
`const prev = $input.first().json
const parts = [{ text: 'Client email:\\n' + prev.email_text + '\\n\\nExtracted data:\\n' + JSON.stringify(prev.ai) }]`,
`const r = await call.call(this, 1, true)
return [{ json: { ok: true, extraction: prev.ai, missing: r.missing || [], suggested_reply: r.missing && r.missing.length ? (r.suggested_reply || null) : null, port_warning: r.port_warning || null, language: r.language || null } }]`)

const quotePrepare = `${AUTH}
const text = String(b.body_text || '').trim()
if (!text && !(b.attachments || []).length) return [{ json: { bad_request: 'body_text or an attachment is required' } }]
${FILES}
return [{ json: { subject: b.subject || '', received_at: new Date().toISOString(), fresh_text: text.slice(0, 20000), files } }]`

const quoteGemini = geminiFn(qSystem, qSchema,
`const p = $input.first().json
const text = 'Carrier email\\nFrom: \\nSubject: ' + p.subject + '\\nReceived: ' + p.received_at + '\\n\\n' + p.fresh_text
const parts = [{ text: text + (p.files.length ? '\\n\\nAttached files (read them; the quote may be only in the file): ' + p.files.map((f) => f.filename).join(', ') : '') }]
for (const f of p.files) parts.push({ inline_data: { mime_type: f.mime_type, data: f.data } })`,
`const ai = await call.call(this, 1, true)
const isQuote = ai.response_type === 'quote' || ai.response_type === 'update' || ai.response_type === 'counter_offer'
return [{ json: isQuote ? { ok: true, extraction: ai } : { ok: false, error: 'That email does not contain a carrier quote.', response_type: ai.response_type } }]`)

const node = (name, type, typeVersion, position, parameters, extra = {}) => ({ name, type, typeVersion, position, parameters, ...extra })
const respond = (name, pos, body, code) => node(name, "n8n-nodes-base.respondToWebhook", 1.1, pos, { respondWith: "json", responseBody: body, options: code ? { responseCode: code } : {} })
const rejected = (pos) => respond("Respond rejected", pos, "={{ { error: $json.unauthorized ? 'Unauthorized' : $json.bad_request } }}", "={{ $json.unauthorized ? 401 : 400 }}")
const link = (a, b, i = 0) => ({ node: b, type: "main", index: i })

const reqWf = {
  name: "Logistricks — Trial: request email",
  nodes: [
    node("Webhook", "n8n-nodes-base.webhook", 2, [0, 300], { httpMethod: "POST", path: "trial-request", responseMode: "responseNode", options: {} }, { webhookId: "logistricks-trial-request" }),
    node("Config", "n8n-nodes-base.code", 2, [220, 300], { jsCode: configCode }),
    node("Prepare", "n8n-nodes-base.code", 2, [440, 300], { jsCode: reqPrepare }),
    node("Rejected?", "n8n-nodes-base.if", 1, [660, 300], { conditions: { boolean: [{ value1: "={{ !!$json.unauthorized || !!$json.bad_request }}", value2: true }] } }),
    rejected([880, 160]),
    node("Gemini extract", "n8n-nodes-base.code", 2, [880, 420], { jsCode: reqGemini }),
    node("Not a request?", "n8n-nodes-base.if", 1, [1100, 420], { conditions: { boolean: [{ value1: "={{ $json.ai.is_rate_request === false }}", value2: true }] } }),
    respond("Respond not a request", [1320, 300], "={{ { ok: false, error: 'The email is not a freight rate request.' } }}", 422),
    node("Gemini reply and checks", "n8n-nodes-base.code", 2, [1320, 520], { jsCode: replyGemini }),
    respond("Respond OK", [1540, 520], "={{ $json }}"),
  ],
  connections: {
    "Webhook": { main: [[link(0, "Config")]] },
    "Config": { main: [[link(0, "Prepare")]] },
    "Prepare": { main: [[link(0, "Rejected?")]] },
    "Rejected?": { main: [[link(0, "Respond rejected")], [link(0, "Gemini extract")]] },
    "Gemini extract": { main: [[link(0, "Not a request?")]] },
    "Not a request?": { main: [[link(0, "Respond not a request")], [link(0, "Gemini reply and checks")]] },
    "Gemini reply and checks": { main: [[link(0, "Respond OK")]] },
  },
  settings: { executionOrder: "v1" },
}
const quoteWf = {
  name: "Logistricks — Trial: carrier quote",
  nodes: [
    node("Webhook", "n8n-nodes-base.webhook", 2, [0, 300], { httpMethod: "POST", path: "trial-quote", responseMode: "responseNode", options: {} }, { webhookId: "logistricks-trial-quote" }),
    node("Config", "n8n-nodes-base.code", 2, [220, 300], { jsCode: configCode }),
    node("Prepare", "n8n-nodes-base.code", 2, [440, 300], { jsCode: quotePrepare }),
    node("Rejected?", "n8n-nodes-base.if", 1, [660, 300], { conditions: { boolean: [{ value1: "={{ !!$json.unauthorized || !!$json.bad_request }}", value2: true }] } }),
    rejected([880, 160]),
    node("Gemini extract", "n8n-nodes-base.code", 2, [880, 420], { jsCode: quoteGemini }),
    respond("Respond OK", [1100, 420], "={{ $json }}"),
  ],
  connections: {
    "Webhook": { main: [[link(0, "Config")]] },
    "Config": { main: [[link(0, "Prepare")]] },
    "Prepare": { main: [[link(0, "Rejected?")]] },
    "Rejected?": { main: [[link(0, "Respond rejected")], [link(0, "Gemini extract")]] },
    "Gemini extract": { main: [[link(0, "Respond OK")]] },
  },
  settings: { executionOrder: "v1" },
}
fs.writeFileSync(path.join(__dirname, "trial-request-workflow.json"), JSON.stringify(reqWf, null, 2))
fs.writeFileSync(path.join(__dirname, "trial-quote-workflow.json"), JSON.stringify(quoteWf, null, 2))
console.log("written", reqWf.nodes.length, quoteWf.nodes.length)
