CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price INTEGER NOT NULL,
  old_price INTEGER DEFAULT 0,
  access TEXT DEFAULT '6 months',
  description TEXT DEFAULT '',
  thumbnail_key TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO courses
(id, title, price, old_price, access, description)
VALUES
(
  'basic',
  'Basic of Share Market',
  1500,
  1999,
  '6 months',
  'Learn the fundamentals of the share market from scratch.'
);

INSERT OR IGNORE INTO courses
(id, title, price, old_price, access, description)
VALUES
(
  'options',
  'Option Trading Course',
  9999,
  12999,
  '6 months',
  'Learn options trading strategies, risk management and practical execution.'
);

ALTER TABLE lessons ADD COLUMN course_id TEXT DEFAULT 'options';

ALTER TABLE payments ADD COLUMN course_id TEXT DEFAULT 'options';

ALTER TABLE entitlements ADD COLUMN course_id TEXT DEFAULT 'options';