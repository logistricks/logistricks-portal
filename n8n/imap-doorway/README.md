# IMAP doorway
Import imap-doorway-workflow.json, pick the Core workflow in 'Run Core workflow', activate. The portal reads the mailboxes (Settings > Receiver Emails > Connect a mailbox) and n8n only polls /api/mail/poll every minute, then acknowledges each handled email.
