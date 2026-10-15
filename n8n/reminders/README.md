# Reminder emails
Import reminder-emails-workflow.json, paste your portal secret into the HTTP node, activate. It calls /api/cron/reminders every 15 minutes; the portal decides what is due (digest, urgent, escalation, weekly) and never sends the same email twice. Run migration 073 first. Times and working days are set in Admin > Task Setup > Email reminders.
