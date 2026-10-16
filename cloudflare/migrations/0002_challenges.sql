CREATE TABLE IF NOT EXISTS app_challenges (
 id TEXT PRIMARY KEY, user_id TEXT, auth_version INTEGER NOT NULL,
 purpose TEXT NOT NULL, session_hash TEXT NOT NULL,
 client_first TEXT NOT NULL, server_first TEXT NOT NULL, nonce TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS app_challenges_expiry ON app_challenges(expires_at);
