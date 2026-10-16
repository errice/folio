# Free Cloudflare hosting

This edition runs the full app on Cloudflare Workers with a D1 (SQLite) database. Visitors register with email, name/nickname and password, without a ChatGPT account. Every workspace belongs to its signed-in user. The original Node/SQLite edition remains available.

## Deploy

Use Node 24.15 or later and the Wrangler CLI (`npm install --save-dev wrangler`).

1. Sign in: `npx wrangler login`.
2. Create a database: `npx wrangler d1 create folio-finance`.
3. Copy `wrangler.jsonc` to the ignored `wrangler.production.jsonc`. Set its `account_id` and D1 `database_id` to the returned values. Set `vars.PUBLIC_ORIGIN` to your exact public HTTPS origin, for example `https://folio-finance.YOUR-SUBDOMAIN.workers.dev`.
4. Apply the schema: `npx wrangler d1 migrations apply folio-finance --remote --config wrangler.production.jsonc`.
5. Publish: `npx wrangler deploy --config wrangler.production.jsonc`.

Wrangler runs `node cloudflare/build.mjs` before deployment. This prepares only app assets and templates, never a local database, account records, exports or secrets. Keep production configuration out of commits. Custom domains are optional; the workers.dev address is free.

## Local verification

```sh
node cloudflare/build.mjs
npx wrangler d1 migrations apply folio-finance --local
npx wrangler dev --port 4176
# In another terminal:
node --test cloudflare/scram.test.mjs cloudflare/integration.test.mjs
```

The suite uses disposable accounts. It verifies registration, database persistence across requests, account isolation, cross-origin protection, stale-tab protection, profile editing, password changes, session revocation and logout. Local data stays in the ignored `.wrangler/` directory. Remote smoke tests require explicit `FOLIO_TEST_URL` and `FOLIO_REMOTE_TEST=true`; remove their exact disposable accounts afterwards using D1, without touching real user records.

## Security and limits

The Cloudflare edition uses the SCRAM-SHA-256 proof calculation over exact UTF-8 password bytes. The browser derives keys with PBKDF2-HMAC-SHA256 (600,000 iterations and a unique 16-byte salt); D1 stores only the salted SCRAM verifier and server key. The Worker verifies a short-lived, single-use nonce-bound proof with constant-time comparisons and returns a server proof. It receives neither the password nor the client key. This keeps expensive password hashing outside the free Worker CPU budget. The proof calculation is tested against RFC 7677 section 3; this is an HTTPS JSON account flow, not a general SASL endpoint. The Node edition retains scrypt; its credential database is separate. Password changes increment a user authentication version, atomically create a fresh session, and invalidate older sessions. Cookies are HttpOnly, Secure on HTTPS, SameSite=Lax, and expire after seven days. Passwords and financial records are not cached in browser storage. Profile emails are read-only. Database writes use prepared statements, validate the financial state, and reject conflicting revisions.

The Worker enforces persistent per-IP and per-email limits; only Cloudflare's supplied connecting-IP header is trusted. Expired sessions and attempt counters are pruned daily. Password reset emails, mailbox verification, MFA and account administration are not implemented.

Stay on **Workers Free** and **D1 Free** to avoid paid usage. Free quotas are finite; exceeding them can stop requests until reset. Do not upgrade billing automatically. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) for current allowances. Test deployed password hashing and complete account flows against the actual free runtime before inviting users; local development does not enforce the same CPU limits. The original server-side PBKDF2 and scrypt approaches could not reliably run within the production free runtime, which is why this edition uses browser-derived SCRAM proofs. There has been no independent security audit.

To migrate your finances, export from the original Folio Settings, register your own account on the new host, and import in Settings. Existing ChatGPT sign-in identities and passwords are not copied. Back up the database privately with Cloudflare D1 export/Time Travel and test restoring it.
