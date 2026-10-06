// n8n Code node "Filter Code"  (Run Once for All Items) — Core workflow, NEW-request path.
// Replaces the old keyword filter. Two stages:
//   1) drop automated / system mail (no-reply senders, auto-submitted, bulk, bounces, out-of-office)
//   2) score the email for freight content with WHOLE-WORD matching (the old filter used substring matching,
//      so "rate" matched "generated", "ton" matched "button", "port" matched "important"…)
// Dropped emails ("intake_source" = manual) always pass: if a person dropped it, they want it processed.
const item = $input.first();
const j = item.json;
const bin = item.binary || {};

if (j.intake_source === 'manual') {
  return [{ json: { ...j, filter_reason: 'manual_drop' }, binary: bin }];
}

// ───────── stage 1: automated / system senders ─────────
const from = String(j.from_email || j.From || '').toLowerCase();
const local = from.split('@')[0] || '';
const domain = (from.split('@')[1] || '').replace(/>$/, '');
const subject = String(j.subject || j.Subject || '');

const NOREPLY_LOCAL = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|noreply|mailer[-_.]?daemon|postmaster|bounces?|notifications?|alerts?|newsletter|automated|auto[-_.]?reply)\b/i;
const SYSTEM_DOMAINS = /(^|\.)(accounts\.google\.com|facebookmail\.com|linkedin\.com|github\.com|n8n\.io|vercel\.com|supabase\.(io|com)|stripe\.com|paypal\.com|zoom\.us|calendar-notification\.google\.com)$/i;
const AUTO_SUBJECT = /^\s*((automatic|auto)[ -]?reply|out of office|undeliverable|delivery status notification|mail delivery (failed|subsystem)|returned mail|failure notice|security alert|verify your)/i;

const autoSubmitted = String(j.auto_submitted || '').toLowerCase();
const precedence = String(j.precedence || '').toLowerCase();

let blocked = null;
if (NOREPLY_LOCAL.test(local)) blocked = 'noreply_sender';
else if (SYSTEM_DOMAINS.test(domain)) blocked = 'system_domain';
else if (autoSubmitted && autoSubmitted !== 'no') blocked = 'auto_submitted';
else if (/bulk|junk|list/.test(precedence)) blocked = 'bulk_precedence';
else if (j.list_unsubscribe) blocked = 'mailing_list';
else if (AUTO_SUBJECT.test(subject)) blocked = 'automated_subject';
if (blocked) return [];

// ───────── stage 2: freight-content score ─────────
let body = String(j.body_text || j.text || j.snippet || '');
body = body.split(/\n\s*On .{5,120} wrote:/i)[0]          // drop quoted history
           .split('\n').filter(l => !l.trim().startsWith('>')).join('\n')
           .slice(0, 6000);
const raw = `${subject}\n${body}`;
const text = raw.toLowerCase();

const has = (w) => new RegExp(`(^|[^a-z0-9])${w}(?![a-z0-9])`, 'i').test(text);
const hasAr = (w) => text.includes(w);

const STRONG = [
  'quotation', 'quote', 'quotes', 'rfq', 'enquiry', 'inquiry', 'freight', 'shipment', 'shipping', 'cargo',
  'container', 'fcl', 'lcl', 'awb', 'cbm', 'incoterms?', 'fob', 'cif', 'cfr', 'exw', 'ddp', 'dap',
  'pol', 'pod', 'hs code', 'bill of lading', 'b/l', 'consignee', 'shipper', 'forwarder', 'freight forwarder',
  'customs clearance', 'door to door', 'door to port', 'reefer', 'flat rack', 'break bulk', 'demurrage',
  'chargeable weight', 'volumetric', 'proforma invoice', 'certificate of origin', 'telex release',
  'navlun', 'nakliye', 'konteyner', 'fret', 'devis', 'conteneur', 'transitaire', 'flete', 'cotización', 'contenedor', 'naviera',
];
const STRONG_AR = ['شحن', 'شحنة', 'حاوية', 'حاويات', 'عرض سعر', 'طلب عرض سعر', 'تخليص', 'بضاعة', 'بضائع', 'بوليصة', 'مخلص جمركي', 'قائمة تعبئة', 'وزن قابل للشحن'];
const WEAK = [
  'rates?', 'price', 'pricing', 'offer', 'booking', 'delivery', 'pickup', 'weight', 'gross weight', 'dimensions?',
  'tons?', 'pallets?', 'crates?', 'skids?', 'port', 'airport', 'vessel', 'sailing', 'etd', 'eta', 'transit time',
  'packing list', 'warehouse', 'logistics', 'customs', 'courier', 'trucking', 'flatbed', 'consolidation',
  'dhl', 'fedex', 'aramex', 'maersk', 'msc', 'cma cgm', 'hapag', 'evergreen', 'cosco', 'zim',
];
const WEAK_AR = ['سعر', 'أسعار', 'وزن', 'كيلو', 'طن', 'ميناء', 'مطار', 'أبعاد', 'توصيل', 'نقل', 'جمارك', 'مستودع', 'ارسالية', 'إرسالية', 'تكلفة'];

const PATTERNS = [
  [/\d+(\.\d+)?\s*[x×]\s*\d+(\.\d+)?\s*[x×]\s*\d+/i, 2],                       // 120x100x105
  [/\b\d+(\.\d+)?\s*(kg|kgs|cbm|mt|tons?|tonnes?|lbs?)\b/i, 2],                  // 500 kg, 12 cbm
  [/\b(20|40)\s*(gp|hc|hq|ft|')\b|\b(20gp|40gp|40hc|40hq)\b/i, 2],               // container sizes
  [/\b(pol|pod|aol|aod)\s*:/i, 2],                                                // POL: / POD:
  [/\bhs\s*code\s*:?\s*\d+/i, 2],
  [/\b\d+\s*(pallets?|skids?|cartons?|boxes?|pkgs?|packages?|pieces?|pcs)\b/i, 1],
  [/\b[A-Z]{3}\s*(to|-|→)\s*[A-Z]{3}\b/, 1],                                      // AMM to DXB (case-sensitive)
];

let score = 0;
const hits = [];
for (const w of STRONG)    if (has(w))   { score += 2; hits.push(w); }
for (const w of STRONG_AR) if (hasAr(w)) { score += 2; hits.push(w); }
for (const w of WEAK)      if (has(w))   { score += 1; hits.push(w); }
for (const w of WEAK_AR)   if (hasAr(w)) { score += 1; hits.push(w); }
for (const [re, pts] of PATTERNS) if (re.test(raw)) { score += pts; hits.push(String(re).slice(0, 24)); }

// a real document attachment (not a signature image) is a mild signal
const docAttachment = Object.values(bin).some(b =>
  /pdf|sheet|excel|word|msword|csv|officedocument|message\/rfc822/i.test(String((b && b.mimeType) || '')));
const needed = docAttachment ? 2 : 3;

if (score < needed) return [];

return [{ json: { ...j, filter_score: score, filter_reason: hits.slice(0, 8).join(', ') }, binary: bin }];
