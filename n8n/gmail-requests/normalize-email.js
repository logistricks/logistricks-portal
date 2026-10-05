// n8n Code node "Normalize Email"  (Run Once for All Items) — lives in the GMAIL doorway workflow.
// Input : the "Gmail Full" node (Gmail → Get, Simple OFF, Download Attachments ON).
// Output: ONE provider-independent email object (+ the attachments as binary) to hand to the Core workflow.
// The Gmail-style aliases (id, threadId, From, To, Subject, snippet, text) let the Core keep its old expressions.
// Later, the Outlook / IMAP / dropped-email workflows only have to produce this same shape.
const g = $input.first().json;
const trig = $('Gmail Trigger').first().json;

const hdr = (n) => {
  const h = g.headers || {};
  const k = Object.keys(h).find((x) => x.toLowerCase() === n.toLowerCase());
  return k ? h[k] : undefined;
};
const text = (v) => (v == null ? '' : typeof v === 'string' ? v : v.text || (Array.isArray(v.value) ? v.value.map((a) => a.address).join(', ') : String(v)));
const fromObj = g.from && g.from.value && g.from.value[0];
const fromRaw = text(g.from) || trig.From || '';
const fromEmail = (fromObj && fromObj.address) || ((fromRaw.match(/<([^>]+)>/) || [])[1]) || fromRaw.trim();
const fromName = (fromObj && fromObj.name) || (fromRaw.match(/^"?([^"<]+?)"?\s*</) || [])[1] || '';
const to = text(g.to) || trig.To || '';
const mailbox = ((to.match(/<([^>]+)>/) || [])[1] || to.split(',')[0] || '').trim().toLowerCase();

return [{
  json: {
    source: 'gmail',
    mailbox,
    to,
    cc: text(g.cc) || '',
    from_email: String(fromEmail || '').trim().toLowerCase(),
    from_name: String(fromName || '').trim(),
    subject: g.subject || trig.Subject || '',
    message_id: g.messageId || hdr('message-id') || '',
    in_reply_to: g.inReplyTo || hdr('in-reply-to') || '',
    references: g.references || hdr('references') || '',
    provider_thread_id: trig.threadId || g.threadId || '',
    received_at: g.date ? new Date(g.date).toISOString() : new Date().toISOString(),
    body_text: g.text || trig.snippet || '',
    attachment_count: Object.keys($input.first().binary || {}).length,
    // aliases for the Core workflow's existing expressions
    id: trig.id || g.id || '',
    threadId: trig.threadId || g.threadId || '',
    From: fromRaw,
    To: to,
    Subject: g.subject || trig.Subject || '',
    snippet: trig.snippet || '',
    text: g.text || trig.snippet || '',
    intake_source: 'automatic',
    intake_filename: null,
  },
  binary: $input.first().binary || {},
}];
