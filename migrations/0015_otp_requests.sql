CREATE TABLE IF NOT EXISTS otp_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  otp TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS otp_email_idx ON otp_requests(email);
