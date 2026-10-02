// n8n Code node "Prepare" — input: webhook body. Output: one item with the Gemini request pieces.
function prepare(inp) {
  const body = String(inp.body_text || "")
  // Keep only the carrier's new text: cut at the first quoted-reply marker.
  const cut = body.search(/^(On .{5,200}wrote:|-{2,}\s*Original Message|_{5,}|From:\s.+@.+|>.*)$/m)
  const fresh = (cut > 0 ? body.slice(0, cut) : body).trim()
  const hay = [inp.subject || "", body].join("\n")
  const m = hay.match(/RFQ-[0-9a-f]{8}-\d+-[0-9a-f]{6}/i)
  const att = (inp.attachments || [])
    .filter((a) => a && a.text)
    .map((a) => `--- Attachment: ${a.filename || "file"} ---\n${String(a.text).slice(0, 15000)}`)
    .join("\n\n")
  return {
    client_code: inp.client_code,
    from_email: String(inp.from_email || "").trim().toLowerCase(),
    subject: inp.subject || "",
    received_at: inp.received_at || new Date().toISOString(),
    message_id: inp.message_id || null,
    thread_id: inp.thread_id || null,
    rfq_reference: m ? m[0] : null,
    fresh_text: fresh.slice(0, 20000),
    quoted_text: cut > 0 ? body.slice(cut).trim().slice(0, 6000) : "",
    raw_text: body.slice(0, 20000),
    attachments_text: att,
  }
}
module.exports = { prepare }
