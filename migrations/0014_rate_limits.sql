CREATE TABLE IF NOT EXISTS rate_limits (
  ip TEXT NOT NULL,
  action TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  window_start TEXT NOT NULL,
  PRIMARY KEY(ip, action)
);
