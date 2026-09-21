CREATE TABLE IF NOT EXISTS lesson_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  completed_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS lesson_progress_user_course
ON lesson_progress(user_id, course_id);
