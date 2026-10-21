# Reminder emails
Import reminder-emails-workflow.json, paste your portal secret into the HTTP node, activate. It calls /api/cron/reminders every 15 minutes; the portal decides what is due (digest, urgent, escalation, weekly) and never sends the same email twice. Run migration 073 first. Times and working days are set in Admin > Task Setup > Email reminders.

The same call now also sends the **carrier reminders** (rate requests with no answer, Settings → Rules → Carrier reminders) and the approval reminders. Run migration 085 first. Nothing else to import.
