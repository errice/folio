# Folio with independent email/password accounts

This edition reuses the Folio dashboard and runs on Node.js 24.15 or newer with a local SQLite file. It does not require ChatGPT sign-in, a paid authentication service, or third-party runtime packages. The existing Sites deployment continues to use its original sign-in and D1 database; this edition must be hosted separately.

## Run locally

From the repository root:

```sh
node standalone/server.mjs
```

Open http://127.0.0.1:4175/register. Registration asks for email, name/nickname, and password (12–128 characters). Each account starts with zero balances, no transactions, and default categories. Sign in with email/password; use Sign out in the top bar. No sample finances or records from another browser account are imported automatically.

By default data is in `data/folio.sqlite`, excluded from Git. Do not commit this file, SQLite WAL files, database backups, or user credentials.

## Host the independent edition

Use a persistent Node.js server or the Docker image. The SQLite file needs a persistent local disk; an ephemeral filesystem will lose accounts and financial records. Run a single app instance with this file. Deploying the container has not been performed as part of preparing this edition.

Configuration:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PUBLIC_ORIGIN` | `http://127.0.0.1:4175` | Exact external origin, without trailing slash. Required HTTPS origin in production. |
| `DATABASE_PATH` | `data/folio.sqlite` | Persistent SQLite database file. |
| `PORT` | `4175` | Application port. |
| `HOST` | `127.0.0.1` | Listening address; use `0.0.0.0` in a container. |
| `ALLOW_REGISTRATION` | `true` | Set `false` to close new signups while allowing existing users to sign in. |

Place an HTTPS reverse proxy in front of the server. Set `NODE_ENV=production` and `PUBLIC_ORIGIN=https://your-domain.example`. The server rejects a non-HTTPS public origin and production startup without HTTPS configuration. It uses Secure, HttpOnly, SameSite session cookies on HTTPS, validates request origins, and does not trust client-supplied forwarding headers for identity or rate limits. Behind a proxy, IP throttling is deliberately shared; set a suitable edge rate limit before a broad public launch.

Docker Compose (from `standalone/`, with `PUBLIC_ORIGIN` set in your environment):

```sh
docker compose up --build -d
```

The app binds the host's loopback port 3000 for the HTTPS reverse proxy. The named `folio-data` volume retains SQLite across container replacements. Docker itself has not been validated on this workstation.

## Move your current finances

On the current hosted Folio, use Settings → Export data. On this edition, create your own account, sign in, and use Settings → Import data. The import belongs only to your signed-in account. It does not copy anybody else's workspace. Keep the original hosted workspace until you have checked the imported balances and transactions.

## Account security and current scope

Passwords use a unique 16-byte random salt and Node's scrypt (`N=131072, r=8, p=1`), with constant-time hash comparisons. Session cookies contain 32-byte random tokens; only token hashes are stored in SQLite. Sessions expire after seven days and are revoked on sign-out. Login and registration attempts have persistent limits, and expensive password computations have bounded concurrency. Every read/write derives ownership from the session. Requests also bind to the tab's signed-in account so a stale tab cannot accidentally overwrite another account after switching users. Financial records and passwords are not saved to browser storage; unsaved edits remain in the current tab with retry/export options. The color theme, public exchange rates, and an account-change notification timestamp can still use browser storage.

Registration does not verify mailbox ownership. Password reset emails, email verification, and account administration are not implemented; no email-sending service is configured. Do not promise those features to users. SQLite data is protected by server/filesystem access, not database encryption; protect disk and backups accordingly.

For consistent backups while the server is running, use SQLite's backup API. Alternatively, stop the app cleanly before copying the database; copying only the main file while WAL writes are active is not a complete backup. Store backups privately and test recovery.

## Checks

```sh
node --test standalone/auth.test.mjs
```

The integration suite covers registration, password hashing, duplicate emails, invalid credentials, session expiry and revocation, cross-origin request rejection, per-user financial isolation, conflicting saves, script escaping, persistence across restart, and rate limiting.

References: [Node crypto](https://nodejs.org/api/crypto.html), [Node SQLite](https://nodejs.org/api/sqlite.html), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
