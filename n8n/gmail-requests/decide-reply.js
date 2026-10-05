// n8n Code node "Decide Reply"  (Run Once for All Items) — lives in the CORE workflow.
// Input : the portal's /api/inbound/resolve response (HTTP Request3 → output is $json.body because Full Response is on).
// Output: ONE item { decision: 'reply'|'new'|'review', request, method, confidence, reason, record, ... }
//         or NO item (the run stops) for duplicate / unknown mailbox / carrier replies.
const GEMINI_KEY = 'PASTE_YOUR_GEMINI_KEY';              // same key your other nodes use
const MODEL = 'gemini-3.6-flash';                         // same model name as your other nodes
const AUTO_LINK = 0.8;                                    // >= this → treat as a reply automatically
const REVIEW_MIN = 0.5;                                   // between REVIEW_MIN and AUTO_LINK → new request flagged "possible reply"

const res = $input.first().json.body || {};
const email = $('Gmail Trigger').first().json;      // in the Core workflow the trigger node is named "Gmail Trigger"

// Stop quietly when there is nothing for this workflow to do.
if (['duplicate', 'unknown_mailbox', 'carrier_reply'].includes(res.decision)) return [];

const record = {
  ...email,
  client_code: res.client_code,
  match_method: res.method || null,
  match_confidence: res.confidence ?? null,
  match_reason: res.reason || null,
  review_status: 'auto',
};
const out = (o) => [{ json: { client_code: res.client_code, record, ...o } }];

// 1) Deterministic hit (thread, headers, request number, same sender + subject)
if (res.decision === 'reply') {
  return out({ decision: 'reply', request: res.request, method: res.method, confidence: res.confidence, reason: res.reason });
}
// 2) Sender has no history → new request
if (res.decision === 'new') {
  return out({ decision: 'new', request: null, method: res.method, confidence: res.confidence, reason: res.reason });
}

// 3) Undetermined → ask the AI to pick from the shortlist (it can only choose an id from the list, or "new")
const cands = res.candidates || [];
const fresh = String(email.body_text || '').split(/\n(?:On .{5,200}wrote:|-{2,}\s*Original Message|_{5,}|From:\s.+@.+)/)[0].trim().slice(0, 3500);
const prompt = `You decide whether an incoming email is a REPLY to one of our existing freight requests, or a NEW request.

Existing requests from this sender (the only valid answers):
${JSON.stringify(cands, null, 1)}

Incoming email
From: ${email.from_name} <${email.from_email}>
Subject: ${email.subject}
New text (quoted history removed):
"""
${fresh}
"""
Also look at the full text for quoted earlier messages: """${String(email.body_text || '').slice(0, 2500)}"""

Rules:
- "reply" only if the email clearly continues ONE listed request: it answers what we asked, mentions the same route/cargo/equipment/reference, responds to our quotation, or quotes our earlier message.
- A different route, cargo or a full fresh enquiry is a NEW request, even from the same sender and even with "Re:" in the subject.
- If you cannot tell, answer "unclear" with your best guess in request_id and a low confidence. Never invent ids.
- reply_kind: provides_missing_info | quotation_response | question | other (only for reply/unclear).
Return ONLY JSON: {"decision":"reply"|"new"|"unclear","request_id":string|null,"confidence":number 0-1,"reply_kind":string|null,"reason":string,"evidence":[string]}`;

let ai = null;
try {
  const r = await this.helpers.httpRequest({
    method: 'POST',
    url: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
    headers: { 'Content-Type': 'application/json' },
    body: { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } },
    json: true,
  });
  const t = r.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
  ai = JSON.parse(t);
} catch (e) {
  ai = { decision: 'unclear', request_id: null, confidence: 0, reason: 'AI call failed: ' + e.message, evidence: [] };
}

const pick = cands.find((c) => c.id === ai.request_id);
const conf = pick ? Number(ai.confidence) || 0 : 0;
record.match_method = 'ai';
record.match_confidence = conf;
record.match_reason = String(ai.reason || '').slice(0, 480);
record.ai_decision = ai;

if (ai.decision === 'reply' && pick && conf >= AUTO_LINK) {
  // fetch the full request row for the reply path (Merge & Patch needs conversation, client_code, …)
  const full = await this.helpers.httpRequest({
    method: 'GET',
    url: `https://YOUR-PROJECT-REF.supabase.co/rest/v1/freight_requests?id=eq.${pick.id}&select=*`,
    headers: { apikey: 'YOUR_SERVICE_ROLE_KEY', Authorization: 'Bearer YOUR_SERVICE_ROLE_KEY' },
    json: true,
  });
  return out({ decision: 'reply', request: full[0], method: 'ai', confidence: conf, reason: ai.reason, reply_kind: ai.reply_kind || null, ai });
}
if (pick && conf >= REVIEW_MIN && ai.decision !== 'new') {
  record.review_status = 'needs_review';
  record.related_request_id = pick.id;               // the new request will be flagged "possible reply to <ref>"
  return out({ decision: 'review', request: null, method: 'ai', confidence: conf, reason: ai.reason, related_request_id: pick.id, ai });
}
return out({ decision: 'new', request: null, method: 'ai', confidence: conf, reason: ai.reason || 'AI: new request', ai });
