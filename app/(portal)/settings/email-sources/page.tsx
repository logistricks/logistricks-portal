import { redirect } from "next/navigation"

// Mailboxes now live on Admin → Emails, next to the outgoing (SMTP) setup.
export default function EmailSourcesRedirect() {
  redirect("/settings?tab=emails")
}
