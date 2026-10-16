# Security and data handling

This release includes an independently runnable email/password edition. It does not contain user accounts, private financial records, production credentials, database backups, or the original private deployment history.

## Built-in protections

- Per-user access is checked server-side using random session cookies, not a caller-supplied owner identifier.
- Each financial request must match the account that opened its tab, protecting against accidental writes after switching users.
- Passwords use a random 16-byte salt and scrypt with N=131072, r=8, p=1. Plaintext passwords are not saved.
- Session tokens use 32 random bytes; only their SHA-256 hashes are stored in SQLite. Sessions expire after seven days and are revoked on sign-out.
- Password changes require the current password, rotate the current session, and revoke all older sessions. Profile editing changes the name/nickname only.
- HTTPS sessions use Secure, HttpOnly, SameSite cookies. JSON writes require an exact allowed origin. Production startup requires a configured HTTPS origin.
- Authentication attempts have persistent limits, and simultaneous password-hashing operations are bounded.
- Parameterized queries and server-side financial-data validation protect database operations. Conflicting saves are rejected instead of silently overwriting another revision.
- Financial browser caches are disabled in this edition. Unsaved edits remain in memory with retry and backup-export options.

## Before inviting users

Use HTTPS and a persistent disk. Run a single server instance for the SQLite file. Restrict access to the database and backups, and test restoration. The database file is not encrypted by this application.

The app does not implement email verification, password recovery emails, MFA, or account administration. Do not advertise those capabilities. Email addresses are not proof of mailbox ownership. There has been no independent security audit.

Behind a reverse proxy, application-level IP limits are conservatively shared because the server does not trust arbitrary forwarding headers. Review capacity and edge limits for your deployment.

Do not attach credentials, session cookies, database files, or real financial records to GitHub issues. For a suspected vulnerability, use a private contact channel offered by [the maintainer](https://github.com/errice); avoid posting exploit details publicly before coordinating a fix.
