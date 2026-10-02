// Generates carrier-reply-workflow.json from the source files in this folder.
// Run: node build-workflow.js
const fs = require("fs")
const strip = (f) => fs.readFileSync(f, "utf8").replace(/^module\.exports.*$/m, "").trim()
const schema = JSON.parse(fs.readFileSync("response-schema.json", "utf8"))
const md = fs.readFileSync("extraction-prompt.md", "utf8")
const system = md.split("```")[1].replace(/^\n/, "").trim()

const configCode = `// Edit the 4 values below. (n8n blocks environment variables in nodes by default, so settings live here.)
const cfg = {
  portal_url: 'https://logistricks-portal.vercel.app',
  portal_secret: 'CHANGE_ME',
  gemini_key: 'CHANGE_ME',
  gemini_model: 'gemini-3.6-flash',
}
return [{ json: { ...$input.first().json, cfg }, binary: $input.first().binary }]`

const CFG = "$('Config').first().json.cfg"
const prepareCode = `${strip("prepare.js")}

const item = $input.first().json
const body = item.body || item
const secret = (item.headers && (item.headers["x-portal-secret"] || item.headers["X-Portal-Secret"])) || ""
if (!item.cfg || !item.cfg.portal_secret || secret !== item.cfg.portal_secret) return [{ json: { unauthorized: true } }]
if ((!body.client_code && !(body.to_email || body.to)) || !body.from_email) return [{ json: { bad_request: "from_email and to_email (or client_code) are required" } }]
const out = prepare(body)
// Files that arrive as real attachments (multipart upload, or a Gmail node with downloadAttachments) travel as n8n binary.
const bin = $input.first().binary || {}
out.file_names = [...out.file_names, ...Object.values(bin).map((b) => b.fileName || 'file')]
return [{ json: out, binary: $input.first().binary }]`

const geminiCode = `// Calls Gemini from code (same pattern as the request-intake workflow): retries, tolerant JSON parsing.
const p = $input.first().json
const cfg = $('Config').first().json.cfg
const SYSTEM = ${JSON.stringify(system)}
const SCHEMA = ${JSON.stringify(schema)}
const text = 'Carrier email\\nFrom: ' + p.from_email + '\\nSubject: ' + p.subject + '\\nReceived: ' + p.received_at + '\\n\\n' + p.fresh_text
  + (p.quoted_text ? '\\n\\n=== QUOTED EARLIER MESSAGES (find references only) ===\\n' + p.quoted_text : '')
  + (p.attachments_text ? '\\n\\n' + p.attachments_text : '')
// PDFs / images attached to the email are handed to the model as files, so it reads them itself.
const files = [...(p.files || [])]
// Real attachments (n8n binary data, same as the Gmail-trigger workflow): PDFs and images go to the model as files.
const SUPPORTED = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif']
const bin = $input.first().binary || {}
for (const key of Object.keys(bin)) {
  const meta = bin[key]
  if (!SUPPORTED.includes(meta.mimeType || '')) continue
  if ((Number(meta.fileSize) || 0) > 15 * 1024 * 1024) continue
  const buffer = await this.helpers.getBinaryDataBuffer(0, key)
  files.push({ filename: meta.fileName || key, mime_type: meta.mimeType, data: buffer.toString('base64') })
}
const parts = [{ text: text + (files.length ? '\\n\\nAttached files (read them; the quote may be only in the file): ' + files.map((f) => f.filename).join(', ') : '') }]
for (const f of files) parts.push({ inline_data: { mime_type: f.mime_type, data: f.data } })

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
    return [{ json: { ...ai, _model: cfg.gemini_model } }]
  } catch (e) {
    const msg = e.message || String(e)
    if (attempt >= 3) throw new Error('Gemini failed after ' + attempt + ' attempts: ' + msg)
    await sleep(msg.includes('429') ? attempt * 6000 : attempt * 3000)
    // If the schema itself is rejected (HTTP 400), retry with the schema described in the prompt instead.
    return call.call(this, attempt + 1, useSchema && !/400|schema|responseSchema/i.test(msg))
  }
}
return await call.call(this, 1, true)`

const buildCode = `${strip("build-body.js")}

const prep = $('Prepare').first().json
const ai = $input.first().json
return [{ json: buildBody(ai, prep, ai._model || 'gemini') }]`

const userMsg = "={{ 'Carrier email\\nFrom: ' + $json.from_email + '\\nSubject: ' + $json.subject + '\\nReceived: ' + $json.received_at + '\\n\\n' + $json.fresh_text + ($json.quoted_text ? '\\n\\n=== QUOTED EARLIER MESSAGES (find references only) ===\\n' + $json.quoted_text : '') + ($json.attachments_text ? '\\n\\n' + $json.attachments_text : '') }}"
const geminiBody = "={{ JSON.stringify({ systemInstruction: { parts: [{ text: " + JSON.stringify(system) + " }] }, contents: [{ role: 'user', parts: [{ text: (" + userMsg.slice(3, -2) + ") }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: " + JSON.stringify(schema) + " } }) }}"

const node = (name, type, typeVersion, position, parameters, extra = {}) => ({ name, type, typeVersion, position, parameters, ...extra })
const wf = {
  name: "Logistricks — Carrier reply → quote",
  nodes: [
    node("Webhook", "n8n-nodes-base.webhook", 2, [0, 300], { httpMethod: "POST", path: "carrier-reply", responseMode: "responseNode", options: {} }, { webhookId: "logistricks-carrier-reply" }),
    node("Config", "n8n-nodes-base.code", 2, [220, 300], { jsCode: configCode }),
    node("Prepare", "n8n-nodes-base.code", 2, [440, 300], { jsCode: prepareCode }),
    node("Rejected?", "n8n-nodes-base.if", 1, [660, 300], { conditions: { boolean: [{ value1: "={{ !!$json.unauthorized || !!$json.bad_request }}", value2: true }] } }),
    node("Respond rejected", "n8n-nodes-base.respondToWebhook", 1.1, [880, 160], { respondWith: "json", responseBody: "={{ { error: $json.unauthorized ? 'Unauthorized' : $json.bad_request } }}", options: { responseCode: "={{ $json.unauthorized ? 401 : 400 }}" } }),
    node("Gemini extract", "n8n-nodes-base.code", 2, [880, 420], { jsCode: geminiCode }, { retryOnFail: false }),
    node("Build portal body", "n8n-nodes-base.code", 2, [1100, 420], { jsCode: buildCode }),
    node("POST /api/carrier-quotes", "n8n-nodes-base.httpRequest", 4.2, [1320, 420], {
      method: "POST", url: "={{ " + CFG + ".portal_url + '/api/carrier-quotes' }}",
      sendHeaders: true, headerParameters: { parameters: [{ name: "X-Portal-Secret", value: "={{ " + CFG + ".portal_secret }}" }] },
      sendBody: true, specifyBody: "json", jsonBody: "={{ JSON.stringify($json) }}", options: { timeout: 30000 },
    }, { retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 }),
    node("Needs attention?", "n8n-nodes-base.if", 1, [1540, 420], { conditions: { boolean: [{ value1: "={{ $json.linked === false || $json.review_status !== 'auto_accepted' }}", value2: true }] } }),
    node("Notify team (connect Slack / email)", "n8n-nodes-base.noOp", 1, [1760, 340], {}),
    node("Respond OK", "n8n-nodes-base.respondToWebhook", 1.1, [1980, 420], { respondWith: "json", responseBody: "={{ $('POST /api/carrier-quotes').first().json }}", options: {} }),
  ],
  connections: {
    "Webhook": { main: [[{ node: "Config", type: "main", index: 0 }]] },
    "Config": { main: [[{ node: "Prepare", type: "main", index: 0 }]] },
    "Prepare": { main: [[{ node: "Rejected?", type: "main", index: 0 }]] },
    "Rejected?": { main: [[{ node: "Respond rejected", type: "main", index: 0 }], [{ node: "Gemini extract", type: "main", index: 0 }]] },
    "Gemini extract": { main: [[{ node: "Build portal body", type: "main", index: 0 }]] },
    "Build portal body": { main: [[{ node: "POST /api/carrier-quotes", type: "main", index: 0 }]] },
    "POST /api/carrier-quotes": { main: [[{ node: "Needs attention?", type: "main", index: 0 }]] },
    "Needs attention?": { main: [[{ node: "Notify team (connect Slack / email)", type: "main", index: 0 }], [{ node: "Respond OK", type: "main", index: 0 }]] },
    "Notify team (connect Slack / email)": { main: [[{ node: "Respond OK", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
}
fs.writeFileSync("carrier-reply-workflow.json", JSON.stringify(wf, null, 2))
console.log("written", wf.nodes.length, "nodes")
