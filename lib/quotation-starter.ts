/** Starter quotation template (HTML) offered when a user creates a new template. */
export const STARTER_SUBJECT = "Quotation {{quotation_number}} — {{origin}} to {{destination}}"

export const STARTER_HTML = `<h2 style="color:#0D1B2A">Quotation {{quotation_number}}</h2>
<p>Date: {{quotation_date}}<br>Reference: {{request_ref}}{{#if quotation_valid_until}}<br>Valid until: {{quotation_valid_until}}{{/if}}</p>
<p>Dear {{sender_first_name|Sir/Madam}},</p>
<p>Thank you for your enquiry. Please find our offer for the shipment below.</p>
<h3>Shipment</h3>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;border:1px solid #cbd5e1">
{{#if pol}}<tr><td style="width:35%"><strong>Port of Loading (POL)</strong></td><td>{{pol}}</td></tr>
<tr><td><strong>Port of Discharge (POD)</strong></td><td>{{pod}}</td></tr>{{/if}}
{{#if route}}<tr><td style="width:35%"><strong>Route</strong></td><td>{{route}}</td></tr>{{/if}}
<tr><td><strong>Cargo</strong></td><td>{{cargo_type}}</td></tr>
<tr><td><strong>Equipment / quantity</strong></td><td>{{equipment}} {{quantity}}</td></tr>
<tr><td><strong>Weight</strong></td><td>{{weight}}</td></tr>
<tr><td><strong>Incoterm</strong></td><td>{{incoterm}}</td></tr>
{{#if pickup_address}}<tr><td><strong>Pickup address</strong></td><td>{{pickup_address}}</td></tr>{{/if}}
<tr><td><strong>Transit time</strong></td><td>{{transit_days}} days</td></tr>
<tr><td><strong>Free days</strong></td><td>{{free_days}} days</td></tr>
</table>
<h3>Charges</h3>
{{charges_table}}
{{#if optional_charges_list}}<h3>Additional charges (not included above)</h3>{{optional_charges_list}}{{/if}}
{{#if terms_block}}<h3>Terms</h3>{{terms_block}}{{/if}}
<p>Please let us know if you would like to proceed.</p>
<p>Best regards,<br>{{prepared_by}}<br>{{company_name}}<br>{{company_contact_email}} {{company_contact_phone}}</p>`
