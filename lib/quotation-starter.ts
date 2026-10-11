/** Starter / default quotation template (HTML). Offered when a user creates a template, and used by "Reset to starter". */
export const STARTER_SUBJECT = "Quotation {{quotation_number}} — {{origin}} to {{destination}}"

export const STARTER_HTML = `<h2 style="color:#0D1B2A;margin:0 0 4px">Quotation</h2>
<table cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin-bottom:14px">
<tr><td style="color:#64748b;padding-right:18px">Quotation no.</td><td><strong>{{quotation_number}}</strong></td></tr>
<tr><td style="color:#64748b;padding-right:18px">Date</td><td>{{quotation_date}}</td></tr>
<tr><td style="color:#64748b;padding-right:18px">Your reference</td><td>{{request_ref}}</td></tr>
{{#if quotation_valid_until}}<tr><td style="color:#64748b;padding-right:18px">Valid until</td><td><strong>{{quotation_valid_until}}</strong></td></tr>{{/if}}
</table>
<p>Dear {{sender_first_name|Sir/Madam}},</p>
<p>Thank you for your enquiry. We are pleased to offer the following for your shipment.</p>

<h3 style="color:#0D1B2A">Shipment details</h3>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
{{#if pol}}<tr><td style="width:34%;padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">Port of loading</td><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">{{pol}}</td></tr>
<tr><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">Port of discharge</td><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">{{pod}}</td></tr>{{/if}}
{{#if route}}<tr><td style="width:34%;padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">Route</td><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">{{route}}</td></tr>{{/if}}
{{#if routing}}<tr><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">Routing</td><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">{{routing}}</td></tr>{{/if}}
<tr><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">Commodity</td><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">{{cargo_type}}</td></tr>
<tr><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">Equipment / quantity</td><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">{{equipment}}{{#if quantity}} — {{quantity}}{{/if}}</td></tr>
<tr><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">Weight</td><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">{{weight}}</td></tr>
<tr><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">Incoterm</td><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">{{incoterm}}</td></tr>
{{#if pickup_address}}<tr><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">Pickup address</td><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">{{pickup_address}}</td></tr>{{/if}}
{{#if etd}}<tr><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">Estimated departure</td><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">{{etd}}</td></tr>{{/if}}
{{#if eta}}<tr><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">Estimated arrival</td><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">{{eta}}</td></tr>{{/if}}
{{#if transit_days}}<tr><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">Transit time</td><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">{{transit_days}} days</td></tr>{{/if}}
{{#if cut_off_date}}<tr><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">Cargo cut-off</td><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">{{cut_off_date}}</td></tr>{{/if}}
{{#if doc_cut_off}}<tr><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">Documents cut-off</td><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">{{doc_cut_off}}</td></tr>{{/if}}
</table>

<h3 style="color:#0D1B2A">Charges</h3>
{{charges_table}}
{{#if optional_charges_list}}<h3 style="color:#0D1B2A">Additional charges (not included above)</h3>{{optional_charges_list}}{{/if}}

{{#if terms_block}}<h3 style="color:#0D1B2A">Terms &amp; conditions</h3>{{terms_block}}{{/if}}

<p>Please let us know if you would like to proceed.</p>
<p>Best regards,<br>{{prepared_by}}<br>{{company_name}}<br>{{company_contact_email}} {{company_contact_phone}}</p>`
