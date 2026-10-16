CREATE TABLE IF NOT EXISTS app_password_resets (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 auth_version INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS app_password_resets_user ON app_password_resets(user_id);
CREATE INDEX IF NOT EXISTS app_password_resets_expiry ON app_password_resets(expires_at);
