// n8n Code node "Filter Code1"  (Run Once for All Items) — Core workflow, REPLY path.
// The email is already linked to an existing request, so NO keyword test is applied here
// ("ok thanks, please proceed" is a perfectly valid reply). We only drop automated mail:
// out-of-office, auto-replies, bounces, mailing lists.
const item = $input.first();
const j = item.json;
const bin = item.binary || {};

if (j.intake_source === 'manual') return [{ json: j, binary: bin }];

const from = String(j.from_email || j.From || '').toLowerCase();
const local = from.split('@')[0] || '';
const subject = String(j.subject || j.Subject || '');
const autoSubmitted = String(j.auto_submitted || '').toLowerCase();
const precedence = String(j.precedence || '').toLowerCase();

const NOREPLY_LOCAL = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|noreply|mailer[-_.]?daemon|postmaster|bounces?|auto[-_.]?reply)\b/i;
const AUTO_SUBJECT = /^\s*((automatic|auto)[ -]?reply|out of office|undeliverable|delivery status notification|mail delivery (failed|subsystem)|returned mail|failure notice)/i;

if (NOREPLY_LOCAL.test(local)) return [];
if (autoSubmitted && autoSubmitted !== 'no') return [];
if (/bulk|junk|list/.test(precedence)) return [];
if (j.list_unsubscribe) return [];
if (AUTO_SUBJECT.test(subject)) return [];

return [{ json: j, binary: bin }];
