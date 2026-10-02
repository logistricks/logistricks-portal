// Generates test-emails/*.json — each file: { input (webhook payload), mock_ai (what a correct extraction returns), expect }
const fs = require("fs")
const quoted = (ref, what) => `\n\nOn Wed, 30 Sep 2026 at 09:12, Logistics Desk <desk@client.example> wrote:\n> Dear partner, please quote ${what}.\n> Ref: ${ref}\n> Thanks`
const mk = (n, name, o) => {
  const ref = o.noRef ? null : `RFQ-1a2b3c4d-${o.carrierId || 7}-ab12c${n % 10}`
  const subject = o.subject || `RE: Rate request ${ref ? "[" + ref + "] " : ""}${o.lane}`
  const input = {
    client_code: "DEMO", from_email: o.from, subject, received_at: "2026-10-01T08:30:00Z",
    message_id: `<msg-${n}@carrier.example>`, thread_id: `thread-${n}`, attachments: [],
    body_text: o.body + (ref ? quoted(ref, o.lane) : quoted("(none)", o.lane)),
  }
  fs.writeFileSync(`test-emails/${String(n).padStart(2, "0")}-${name}.json`, JSON.stringify({ input, mock_ai: o.ai, expect: o.expect }, null, 2))
}
fs.mkdirSync("test-emails", { recursive: true })
const base = { ai_confidence: 0.95, inferred_fields: [], key_evidence: [] }

mk(1, "air-firm", { lane: "AMM-FRA air 120kg", from: "ops@skyline-air.example",
  body: `Hi,\n\nPlease find our rate for AMM-FRA, 2 pcs 120x100x100 cm, 120 kg total, general cargo.\n\nFreight: USD 2.50/kg\nFuel surcharge: USD 0.45/kg\nSecurity: USD 0.12/kg\nAWB fee: USD 35 per shipment\nAll rates on chargeable weight (6000 divisor). Direct flight, transit 1 day, space confirmed.\nQuote reference SK-88123, valid 7 days.\n\nBest regards,\nLina - Skyline Air Cargo`,
  ai: { ...base, response_type: "quote", quote_status: "firm", carrier_quote_ref: "SK-88123", mode: "air", service_level: "standard", quote_date: "2026-10-01", validity_days: 7, currency: "USD",
    transit_days: 1, gross_weight: 120, weight_unit: "kg", pieces: 2, dimensions: [{ length_cm: 120, width_cm: 100, height_cm: 100, pieces: 2 }], volumetric_divisor: 6000, origin_code: "AMM", destination_code: "FRA", direct_or_connecting: "direct", space_confirmed: true,
    charges: [{ carrier_label: "Freight", canonical_code: "BASE_FREIGHT", basis: "per_kg", unit_rate: 2.5, inclusion: "included" }, { carrier_label: "Fuel surcharge", canonical_code: "FUEL", basis: "per_kg", unit_rate: 0.45, inclusion: "included" }, { carrier_label: "Security", canonical_code: "SECURITY", basis: "per_kg", unit_rate: 0.12, inclusion: "included" }, { carrier_label: "AWB fee", canonical_code: "AWB_FEE", basis: "per_shipment", unit_rate: 35, inclusion: "included" }] },
  expect: { linked: true, chargeable_weight: 400, chargeable_basis: "volumetric", total_amount: 1263, validity_date: "2026-10-08", review_status: "auto_accepted", flags: [] } })

mk(2, "air-chargeable-mismatch", { lane: "AMM-DXB air 120kg", from: "ops@skyline-air.example", carrierId: 8,
  body: `Hello,\n\nAMM-DXB: USD 1.90/kg on 120 kg chargeable. Total USD 228 plus AWB 30. Grand total USD 258.\nShipment is 2 pcs 120x100x100 cm. Valid until 2026-10-12. Space subject to confirmation at booking.\n\nRegards,\nOmar`,
  ai: { ...base, response_type: "quote", quote_status: "subject_to_space", mode: "air", validity_date: "2026-10-12", currency: "USD", gross_weight: 120, weight_unit: "kg", dimensions: [{ length_cm: 120, width_cm: 100, height_cm: 100, pieces: 2 }], chargeable_weight_stated: 120, origin_code: "AMM", destination_code: "DXB", total_amount_stated: 258, subject_to_conditions: "Space subject to confirmation at booking",
    charges: [{ carrier_label: "Freight", basis: "per_kg", unit_rate: 1.9, quantity: 120, amount: 228, inclusion: "included" }, { carrier_label: "AWB", basis: "per_shipment", amount: 30, inclusion: "included" }] },
  expect: { linked: true, chargeable_weight: 400, total_amount: 258, review_status: "needs_review", flags: ["chargeable_mismatch", "not_firm"] } })

mk(3, "sea-lcl", { lane: "Aqaba-Hamburg LCL 3.2t 5cbm", from: "pricing@bluewave-lines.example", carrierId: 9,
  body: `Dear Sir,\n\nLCL Aqaba -> Hamburg, 3,200 kg / 5 cbm.\nOcean freight USD 65 per W/M\nOrigin THC USD 18 per W/M\nDocumentation USD 45 per shipment\nTransit about 24 days, weekly sailing (Thursdays). Free time at destination 5 days.\nRates firm, valid to 2026-10-31.\n\nBlueWave Lines`,
  ai: { ...base, response_type: "quote", quote_status: "firm", mode: "sea", service_level: "LCL", validity_date: "2026-10-31", currency: "USD", transit_days: 24, free_days: 5, frequency: "weekly", gross_weight: 3200, weight_unit: "kg", volume_cbm: 5, origin_place: "Aqaba", destination_place: "Hamburg",
    charges: [{ carrier_label: "Ocean freight", canonical_code: "BASE_FREIGHT", basis: "per_wm", unit_rate: 65, inclusion: "included" }, { carrier_label: "Origin THC", canonical_code: "THC_ORIGIN", basis: "per_wm", unit_rate: 18, inclusion: "included" }, { carrier_label: "Documentation", canonical_code: "DOCS", basis: "per_shipment", unit_rate: 45, inclusion: "included" }] },
  expect: { linked: true, chargeable_weight: 5, chargeable_unit: "rt", chargeable_basis: "wm_volume", total_amount: 460, review_status: "auto_accepted", flags: [] } })

mk(4, "sea-fcl-40hc", { lane: "Aqaba-Jebel Ali 1x40HC", from: "spot@gulfmarine.example", carrierId: 10,
  body: `Hi team,\n\n1 x 40'HC Aqaba to Jebel Ali, FOB:\nOcean freight: USD 2,450 / container\nBAF: USD 180 / container\nTHC origin: USD 220 / container\nBL fee: USD 60 / BL\nAll-in USD 2,910. Transit 28 days. Free time 7 days demurrage / 7 days detention at destination, then USD 75/day.\nValid until 2026-10-20. Subject to equipment availability.\n\nGulf Marine`,
  ai: { ...base, response_type: "quote", quote_status: "subject_to_equipment", mode: "sea", service_level: "FCL", validity_date: "2026-10-20", currency: "USD", transit_days: 28, container_type: "40HC", container_count: 1, incoterm: "FOB", total_amount_stated: 2910, is_all_in: true, free_days_demurrage: 7, free_days_detention: 7, per_diem_note: "USD 75/day after free time", subject_to_conditions: "Subject to equipment availability",
    charges: [{ carrier_label: "Ocean freight", basis: "per_container", unit_rate: 2450, inclusion: "included" }, { carrier_label: "BAF", canonical_code: "BAF", basis: "per_container", unit_rate: 180, inclusion: "included" }, { carrier_label: "THC origin", canonical_code: "THC_ORIGIN", basis: "per_container", unit_rate: 220, inclusion: "included" }, { carrier_label: "BL fee", canonical_code: "BL_FEE", basis: "per_shipment", unit_rate: 60, inclusion: "included" }] },
  expect: { linked: true, total_amount: 2910, review_status: "needs_review", flags: ["not_firm"] } })

mk(5, "sea-fcl-total-mismatch", { lane: "Aqaba-Jebel Ali 1x40HC", from: "spot@gulfmarine.example", carrierId: 10,
  body: `Hi,\n\nRevised: 40'HC Aqaba-Jebel Ali. Freight 2,450, BAF 180, THC 220, BL 60. Total USD 2,810 all-in. Firm, valid until 2026-10-22.\n\nGulf Marine`,
  ai: { ...base, response_type: "update", quote_status: "firm", mode: "sea", service_level: "FCL", validity_date: "2026-10-22", currency: "USD", container_type: "40HC", container_count: 1, total_amount_stated: 2810, is_all_in: true,
    charges: [{ carrier_label: "Freight", basis: "per_container", unit_rate: 2450, inclusion: "included" }, { carrier_label: "BAF", basis: "per_container", unit_rate: 180, inclusion: "included" }, { carrier_label: "THC", basis: "per_container", unit_rate: 220, inclusion: "included" }, { carrier_label: "BL", basis: "per_shipment", unit_rate: 60, inclusion: "included" }] },
  expect: { linked: true, total_amount: 2910, review_status: "needs_review", flags: ["total_mismatch"] } })

mk(6, "road-ftl-reefer", { lane: "Amman-Riyadh FTL reefer 18t", from: "dispatch@desertroad.example", carrierId: 11,
  body: `Dear colleague,\n\nFTL reefer (-18C) Amman -> Riyadh, 18,000 kg frozen food.\nRate USD 1,850 per truck, fuel and border fees included. Transit 3 days. Pickup within 24h of booking. Detention after 8 free hours USD 25/hour.\nValid for 5 days. Firm.\n\nDesert Road Transport`,
  ai: { ...base, response_type: "quote", quote_status: "firm", mode: "land", service_level: "FTL", quote_date: "2026-10-01", validity_days: 5, currency: "USD", transit_days: 3, gross_weight: 18000, weight_unit: "kg", equipment_type: "reefer", temperature_control: "-18C", commodity_description: "frozen food", origin_place: "Amman", destination_place: "Riyadh", is_all_in: true, per_diem_note: "Detention USD 25/hour after 8 free hours",
    charges: [{ carrier_label: "FTL rate (incl. fuel, border fees)", basis: "per_shipment", unit_rate: 1850, inclusion: "included" }] },
  expect: { linked: true, chargeable_weight: 18000, total_amount: 1850, validity_date: "2026-10-06", review_status: "auto_accepted", flags: [] } })

mk(7, "decline", { lane: "AMM-FRA air 120kg", from: "ops@skyline-air.example", carrierId: 7, noRef: false,
  body: `Hi,\n\nThanks for the enquiry, but we have no space on this lane until mid-November due to peak season. Unable to offer.\n\nRegards,\nLina`,
  ai: { ...base, response_type: "decline", mode: "air", notes: "No space until mid-November due to peak season." },
  expect: { linked: true, rfq_status: "declined", review_status: "needs_review", flags: ["not_a_quote"] } })

mk(8, "info-request", { lane: "Aqaba-Hamburg LCL", from: "pricing@bluewave-lines.example", carrierId: 9,
  body: `Hello,\n\nBefore we can quote, please send: the HS code, whether the cartons are stackable, and the exact dimensions per pallet. Also is the cargo DG?\n\nThanks,\nBlueWave`,
  ai: { ...base, response_type: "info_request", mode: "sea", notes: "Carrier needs: HS code, stackability, dimensions per pallet, DG status." },
  expect: { linked: true, review_status: "needs_review", flags: ["not_a_quote"] } })

mk(9, "counter-offer", { lane: "AMM-FRA air 120kg", from: "ops@skyline-air.example", carrierId: 7,
  body: `Hi,\n\nWe cannot do the requested Tuesday flight. We can offer Thursday (flight SK412, dep 2026-10-08 14:00, arr 2026-10-08 19:30) at USD 3.10/kg on chargeable weight, indicative only, subject to space. Please confirm if you want us to hold.\n\nLina`,
  ai: { ...base, response_type: "counter_offer", quote_status: "indicative", mode: "air", currency: "USD", etd: "2026-10-08T14:00:00", eta: "2026-10-08T19:30:00", origin_code: "AMM", destination_code: "FRA", subject_to_conditions: "Indicative only, subject to space", notes: "Offers Thursday flight SK412 instead of Tuesday.",
    charges: [{ carrier_label: "Freight", basis: "per_kg", unit_rate: 3.1, inclusion: "included" }] },
  expect: { linked: true, review_status: "needs_review", flags: ["not_a_quote", "not_firm"] } })

mk(10, "unknown-sender-mixed-currency", { lane: "Mersin-Aqaba LCL", noRef: true, from: "sales@newforwarder.example", subject: "Our LCL offer Mersin - Aqaba",
  body: `Dear Sir,\n\nFollowing our call, offer for LCL Mersin-Aqaba: ocean EUR 55/cbm, THC origin EUR 15/cbm, destination charges USD 40 per shipment, docs USD 30. Valid till 2026-10-25. Cargo 2.5 cbm 1,100 kg.\n\nNew Forwarder Ltd`,
  ai: { ...base, response_type: "quote", quote_status: "firm", mode: "sea", service_level: "LCL", validity_date: "2026-10-25", currency: "EUR", gross_weight: 1100, weight_unit: "kg", volume_cbm: 2.5, origin_place: "Mersin", destination_place: "Aqaba",
    charges: [{ carrier_label: "Ocean", basis: "per_cbm", unit_rate: 55, currency: "EUR", inclusion: "included" }, { carrier_label: "THC origin", basis: "per_cbm", unit_rate: 15, currency: "EUR", inclusion: "included" }, { carrier_label: "Destination charges", basis: "per_shipment", unit_rate: 40, currency: "USD", inclusion: "included" }, { carrier_label: "Docs", basis: "per_shipment", unit_rate: 30, currency: "USD", inclusion: "included" }] },
  expect: { linked: false, reason: "carrier_not_recognised", review_status: "needs_review", flags: ["mixed_currency"] } })

mk(11, "auto-reply", { lane: "AMM-FRA air 120kg", from: "ops@skyline-air.example", carrierId: 7,
  body: `Thank you for your email. I am out of the office until 12 October with limited access to email. For urgent matters contact dispatch@skyline-air.example.`,
  ai: { ...base, response_type: "other", notes: "Out-of-office auto-reply until 12 October." },
  expect: { linked: true, review_status: "needs_review", flags: ["not_a_quote"] } })
console.log("11 test emails written")
