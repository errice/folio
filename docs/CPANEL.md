# cPanel hosting

Folio can run on cPanel with CloudLinux Node.js 22.23.3 and Passenger. This
entry point uses the same account, recovery, and dashboard service as the
Cloudflare edition, backed by a private SQLite database on the hosting account.
It requires no npm dependencies on the server.

1. Run `node cloudflare/build.mjs` locally.
2. Upload these files to a dedicated application folder outside all public
   document roots, preserving their paths:
   - `app.cjs`, `LICENSE`
   - `standalone/cpanel.mjs`
   - `lib/finance-store.mjs`
   - `cloudflare/worker.mjs`, `cloudflare/reset-mail.mjs`
   - `cloudflare/migrations/*.sql`
   - `cloudflare/dist/templates.mjs`, `cloudflare/dist/assets/*`
3. Create a subdomain with a separate, empty public document root. Do not point
   the document root at the application folder or its database.
4. In **Setup Node.js App**, select Node.js 22.23.3, Production, the uploaded
   application folder, the subdomain with an empty URL path, and `app.cjs`.
5. Set `PUBLIC_ORIGIN` to the public HTTPS origin without a trailing slash.
   Optional settings: `DATABASE_PATH` (absolute private file path),
   `ALLOW_REGISTRATION=false`, `EMAIL_FROM`, and `RESEND_API_KEY`.
6. For recovery email, use a verified sender and a sending-only Resend key
   restricted to its domain. Enter the key in the hosting settings, never Git.
7. Point DNS to the hosting server, install its certificate, enforce HTTPS,
   and verify `/login`, `/register`, and `/forgot-password` before sharing.

The default database is `data/folio-cpanel.sqlite` inside the private app folder.
Back up SQLite with its backup API, or stop the app before copying the database
and its WAL files. Do not copy a live database file alone.

Deploying the code creates a separate database. Existing Cloudflare users and
finances are not automatically transferred. Keep the old service until any
required migration has been planned and verified. The older scrypt standalone
database uses a different credential format; do not point this entry point at it.

Check compatibility locally with Node.js 22:
`node --test standalone/cpanel.test.mjs cloudflare/reset.test.mjs`.
