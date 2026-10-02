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
  gemini_model: 'gemini-2.5-flash',
}
return [{ json: { ...$input.first().json, cfg } }]`

const CFG = "$('Config').first().json.cfg"
const prepareCode = `${strip("prepare.js")}

const item = $input.first().json
const body = item.body || item
const secret = (item.headers && (item.headers["x-portal-secret"] || item.headers["X-Portal-Secret"])) || ""
if (!item.cfg || !item.cfg.portal_secret || secret !== item.cfg.portal_secret) return [{ json: { unauthorized: true } }]
if (!body.client_code || !body.from_email) return [{ json: { bad_request: "client_code and from_email are required" } }]
return [{ json: prepare(body) }]`

const buildCode = `${strip("build-body.js")}

const prep = $('Prepare').first().json
const resp = $input.first().json
const text = resp.candidates?.[0]?.content?.parts?.[0]?.text
if (!text) throw new Error('Gemini returned no content: ' + JSON.stringify(resp).slice(0, 500))
const ai = JSON.parse(text)
return [{ json: buildBody(ai, prep, resp.modelVersion || 'gemini') }]`

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
    node("Gemini extract", "n8n-nodes-base.httpRequest", 4.2, [880, 420], {
      method: "POST",
      url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + " + CFG + ".gemini_model + ':generateContent' }}",
      sendHeaders: true, headerParameters: { parameters: [{ name: "x-goog-api-key", value: "={{ " + CFG + ".gemini_key }}" }] },
      sendBody: true, specifyBody: "json", jsonBody: geminiBody, options: { timeout: 90000 },
    }, { retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 }),
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
