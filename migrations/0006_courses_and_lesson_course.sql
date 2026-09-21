CREATE TABLE IF NOT EXISTS courses(
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  old_price INTEGER NOT NULL DEFAULT 0,
  access TEXT NOT NULL DEFAULT '6 months',
  description TEXT DEFAULT '',
  thumbnail_key TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO courses(id,title,price,old_price,access,description)
VALUES
  ('basic-share-market','Basic of Share Market',1500,0,'lifetime','Understand how the share market works, key concepts and analysis basics.'),
  ('option-trading','Option Trading Course',9999,0,'lifetime','Learn options strategies, risk management and practical trade execution.');

ALTER TABLE lessons ADD COLUMN course_id TEXT NOT NULL DEFAULT 'basic-share-market';

CREATE INDEX IF NOT EXISTS lessons_course_position_idx
ON lessons(course_id, position);