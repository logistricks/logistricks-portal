/** The two quotation options of a cycle (only written when sent, so an older database without migration 087 keeps working). */
export function quotationOpts(body: Record<string, unknown>) {
  const o: Record<string, string> = {}
  if (body.quotation_approval === "off" || body.quotation_approval === "always" || body.quotation_approval === "warnings") o.quotation_approval = body.quotation_approval
  if (body.quotation_after_approval === "manual" || body.quotation_after_approval === "auto") o.quotation_after_approval = body.quotation_after_approval
  return o
}

