-- Bootstrap the private JTrader administrator account.
INSERT INTO users (id,name,email,password_hash,password_salt,role,city,created_at)
SELECT 'jtrader-admin-0001','JTrader Admin','jeyaakash8@gmail.com','52e2362706802996f6fa1559042f2a1349e1d9ad225c26c6bca4e2649bc2d0c2','6efb9daff42060828dcc88f52d16261f','admin','',datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='jeyaakash8@gmail.com');
UPDATE users SET role='admin', name='JTrader Admin' WHERE email='jeyaakash8@gmail.com';
