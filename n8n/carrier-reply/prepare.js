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
  // Attached files the model can read directly (PDF / images), sent as base64: [{filename, mime_type, data_base64}]
  const files = (inp.attachments || [])
    .filter((a) => a && a.data_base64 && /^(application\/pdf|image\/(png|jpe?g|webp))$/i.test(String(a.mime_type || "")) && String(a.data_base64).length < 8_000_000)
    .slice(0, 4)
    .map((a) => ({ filename: a.filename || "file", mime_type: String(a.mime_type).toLowerCase(), data: String(a.data_base64).replace(/^data:[^,]*,/, "") }))
  return {
    client_code: inp.client_code || null,
    intake_source: inp.intake_source === "manual" ? "manual" : "automatic",
    intake_filename: inp.intake_filename || null,
    freight_request_id: inp.freight_request_id || null,
    to_email: String(inp.to_email || inp.to || "").trim().toLowerCase(),
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
    files,
    file_names: files.map((f) => f.filename),
  }
}
module.exports = { prepare }
