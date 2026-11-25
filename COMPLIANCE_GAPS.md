# Compliance gaps (draft, not legal advice)

Based on the code only. Markets, real customer data and payments were not confirmed, so treat this as a checklist to discuss with a lawyer.

- **Personal data held:** names, business emails, phone numbers (WhatsApp), carrier contacts, email bodies and attachments, login names, password hashes, IP addresses (login attempts), push subscriptions. Sub-processors seen in code: Supabase, Vercel, n8n, Google (Gemini, Gmail).
- **Missing:** privacy policy, terms of service, data processing agreement for forwarders, cookie notice (only a session cookie and localStorage theme are used, so a short notice is enough), sub-processor list, breach procedure.
- **Retention and deletion:** trial data is purged after 5 days. Production emails, requests and logs have no retention rule or customer export or delete function (already an open to-do).
- **AI use:** requests and attachments are sent to Gemini. Say so in the privacy policy and check the provider's data-use terms.
- **Backups and access:** backups are an open to-do. Admin access to customer data should be logged (Activity log exists for user actions only).
- **Payments:** none in code. If added, use a hosted checkout so card data never touches this app.
- **Third-party licenses:** run `npx license-checker --summary` before any customer-facing release (not run here).
