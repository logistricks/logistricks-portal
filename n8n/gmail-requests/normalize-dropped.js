// n8n Code node "Normalize Dropped"  (Run Once for All Items) — lives in the DROPPED-EMAIL doorway workflow.
// Input : the Webhook node (POST from the portal's /api/inbound/email, JSON body).
// Output: the same email object as the Gmail doorway, with the attachments turned back into n8n binary.
const SECRET = 'PASTE_PORTAL_WEBHOOK_SECRET';              // must equal PORTAL_WEBHOOK_SECRET in Vercel
const w = $input.first().json;
const b = w.body || {};
if ((w.headers || {})['x-portal-secret'] !== SECRET) throw new Error('Unauthorized');

const binary = {};
let i = 0;
for (const a of b.attachments || []) {
  if (!a || !a.data_base64) continue;
  binary['attachment_' + i++] = await this.helpers.prepareBinaryData(
    Buffer.from(String(a.data_base64).replace(/^data:[^,]*,/, ''), 'base64'),
    a.filename || 'attachment',
    a.mime_type || 'application/octet-stream',
  );
}
const mailbox = String(b.to_email || '').trim().toLowerCase();
const fromName = b.from_name || '';
const fromRaw = fromName ? `${fromName} <${b.from_email}>` : String(b.from_email || '');

return [{
  json: {
    source: 'manual',
    mailbox,
    to: mailbox,
    cc: (b.cc || []).join(', '),
    from_email: String(b.from_email || '').trim().toLowerCase(),
    from_name: fromName,
    subject: b.subject || '',
    message_id: b.message_id || '',
    in_reply_to: b.in_reply_to || '',
    references: (b.references || []).join(' '),
    provider_thread_id: '',
    received_at: b.received_at || new Date().toISOString(),
    body_text: b.body_text || '',
    attachment_count: i,
    // aliases for the Core workflow's existing expressions
    id: '',
    threadId: '',
    From: fromRaw,
    To: mailbox,
    Subject: b.subject || '',
    snippet: String(b.body_text || '').slice(0, 200),
    text: b.body_text || '',
    intake_source: 'manual',
    intake_filename: b.intake_filename || 'dropped email',
  },
  binary,
}];
