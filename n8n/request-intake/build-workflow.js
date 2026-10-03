// Generates request-intake-workflow.json. Run: node build-workflow.js
const fs = require("fs")
const schema = JSON.parse(fs.readFileSync("response-schema.json", "utf8"))
const system = fs.readFileSync("extraction-prompt.md", "utf8").split("```")[1].replace(/^\n/, "").trim()

const configCode = `// Edit the values below. (n8n blocks environment variables in nodes by default, so settings live here.)
const cfg = {
  portal_url: 'https://logistricks-portal.vercel.app',
  portal_secret: 'CHANGE_ME',
  gemini_key: 'CHANGE_ME',
  gemini_model: 'gemini-3.6-flash',
}
return [{ json: { ...$input.first().json, cfg } }]`

const prepareCode = `const item = $input.first().json
const b = item.body || item
const secret = (item.headers && (item.headers['x-portal-secret'] || item.headers['X-Portal-Secret'])) || ''
if (!item.cfg || !item.cfg.portal_secret || secret !== item.cfg.portal_secret) return [{ json: { unauthorized: true } }]
if (!b.client_code || !b.from_email) return [{ json: { bad_request: 'client_code and from_email are required' } }]
const body = String(b.body_text || '')
// Only the requester's new text: cut at the first quoted-reply marker.
const cut = body.search(/^(On .{5,200}wrote:|-{2,}\\s*Original Message|_{5,}|From:\\s.+@.+|>.*)$/m)
const fresh = (cut > 0 ? body.slice(0, cut) : body).trim()
const files = (b.attachments || [])
  .filter((a) => a && a.data_base64 && /^(application\\/pdf|image\\/(png|jpe?g|webp))$/i.test(String(a.mime_type || '')) && String(a.data_base64).length < 8000000)
  .slice(0, 4)
  .map((a) => ({ filename: a.filename || 'file', mime_type: String(a.mime_type).toLowerCase(), data: String(a.data_base64).replace(/^data:[^,]*,/, '') }))
return [{ json: {
  client_code: b.client_code, from_email: String(b.from_email).toLowerCase(), from_name: b.from_name || '',
  subject: b.subject || '', received_at: b.received_at || new Date().toISOString(),
  fresh_text: fresh.slice(0, 20000), raw_text: body.slice(0, 50000), files,
  intake_source: b.intake_source === 'manual' ? 'manual' : 'automatic', intake_filename: b.intake_filename || null,
} }]`

const geminiCode = `// Calls Gemini from code: retries, tolerant JSON parsing.
const p = $input.first().json
const cfg = $('Config').first().json.cfg
const SYSTEM = ${JSON.stringify(system)}
const SCHEMA = ${JSON.stringify(schema)}
const text = 'Freight request email\\nFrom: ' + p.from_name + ' <' + p.from_email + '>\\nSubject: ' + p.subject + '\\nReceived: ' + p.received_at + '\\n\\n' + p.fresh_text
const parts = [{ text: text + (p.files.length ? '\\n\\nAttached files (read them): ' + p.files.map((f) => f.filename).join(', ') : '') }]
for (const f of p.files) parts.push({ inline_data: { mime_type: f.mime_type, data: f.data } })
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
    return [{ json: ai }]
  } catch (e) {
    const msg = e.message || String(e)
    if (attempt >= 3) throw new Error('Gemini failed after ' + attempt + ' attempts: ' + msg)
    await sleep(msg.includes('429') ? attempt * 6000 : attempt * 3000)
    return call.call(this, attempt + 1, useSchema && !/400|schema|responseSchema/i.test(msg))
  }
}
return await call.call(this, 1, true)`

const buildCode = `const prep = $('Prepare').first().json
const ai = $input.first().json
if (ai.is_rate_request === false) return [{ json: { skip: true, reason: 'The email is not a freight rate request.' } }]
const PASS = ['sender_phone','modes','origin_city','origin_country','destination_city','destination_country','cargo_type','equipment','weight','quantity','dimensions','incoterm','pickup_address','bl_type','preferred_carrier','urgency','aog','dgr','special_requirements','availability_questions','confidence']
const b = {
  client_code: prep.client_code, sender_name: ai.sender_name || prep.from_name || null, sender_email: prep.from_email,
  received_at: prep.received_at, raw_message: 'Subject: ' + prep.subject + '\\n\\n' + prep.raw_text,
  intake_source: prep.intake_source, intake_filename: prep.intake_filename,
}
for (const k of PASS) if (ai[k] !== undefined) b[k] = ai[k]
return [{ json: b }]`

const node = (name, type, typeVersion, position, parameters, extra = {}) => ({ name, type, typeVersion, position, parameters, ...extra })
const CFG = "$('Config').first().json.cfg"
const wf = {
  name: "Logistricks — Manual email → request",
  nodes: [
    node("Webhook", "n8n-nodes-base.webhook", 2, [0, 300], { httpMethod: "POST", path: "request-intake", responseMode: "responseNode", options: {} }, { webhookId: "logistricks-request-intake" }),
    node("Config", "n8n-nodes-base.code", 2, [220, 300], { jsCode: configCode }),
    node("Prepare", "n8n-nodes-base.code", 2, [440, 300], { jsCode: prepareCode }),
    node("Rejected?", "n8n-nodes-base.if", 1, [660, 300], { conditions: { boolean: [{ value1: "={{ !!$json.unauthorized || !!$json.bad_request }}", value2: true }] } }),
    node("Respond rejected", "n8n-nodes-base.respondToWebhook", 1.1, [880, 160], { respondWith: "json", responseBody: "={{ { error: $json.unauthorized ? 'Unauthorized' : $json.bad_request } }}", options: { responseCode: "={{ $json.unauthorized ? 401 : 400 }}" } }),
    node("Gemini extract", "n8n-nodes-base.code", 2, [880, 420], { jsCode: geminiCode }),
    node("Build portal body", "n8n-nodes-base.code", 2, [1100, 420], { jsCode: buildCode }),
    node("Not a request?", "n8n-nodes-base.if", 1, [1320, 420], { conditions: { boolean: [{ value1: "={{ !!$json.skip }}", value2: true }] } }),
    node("Respond skipped", "n8n-nodes-base.respondToWebhook", 1.1, [1540, 300], { respondWith: "json", responseBody: "={{ { ok: false, error: $json.reason } }}", options: { responseCode: 422 } }),
    node("POST /api/requests/intake", "n8n-nodes-base.httpRequest", 4.2, [1540, 520], {
      method: "POST", url: "={{ " + CFG + ".portal_url + '/api/requests/intake' }}",
      sendHeaders: true, headerParameters: { parameters: [{ name: "X-Portal-Secret", value: "={{ " + CFG + ".portal_secret }}" }] },
      sendBody: true, specifyBody: "json", jsonBody: "={{ JSON.stringify($json) }}", options: { timeout: 30000 },
    }, { retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 }),
    node("Respond OK", "n8n-nodes-base.respondToWebhook", 1.1, [1760, 520], { respondWith: "json", responseBody: "={{ $json }}", options: {} }),
  ],
  connections: {
    "Webhook": { main: [[{ node: "Config", type: "main", index: 0 }]] },
    "Config": { main: [[{ node: "Prepare", type: "main", index: 0 }]] },
    "Prepare": { main: [[{ node: "Rejected?", type: "main", index: 0 }]] },
    "Rejected?": { main: [[{ node: "Respond rejected", type: "main", index: 0 }], [{ node: "Gemini extract", type: "main", index: 0 }]] },
    "Gemini extract": { main: [[{ node: "Build portal body", type: "main", index: 0 }]] },
    "Build portal body": { main: [[{ node: "Not a request?", type: "main", index: 0 }]] },
    "Not a request?": { main: [[{ node: "Respond skipped", type: "main", index: 0 }], [{ node: "POST /api/requests/intake", type: "main", index: 0 }]] },
    "POST /api/requests/intake": { main: [[{ node: "Respond OK", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
}
fs.writeFileSync("request-intake-workflow.json", JSON.stringify(wf, null, 2))
console.log("written", wf.nodes.length, "nodes")
