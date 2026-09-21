import {mkdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {Database} from 'bun:sqlite';

type Statement = {bind: (...values: unknown[]) => Statement; all: () => Promise<{results: unknown[]}>; first: <T = unknown>() => Promise<T | null>; run: () => Promise<unknown>};

const databasePath = join(process.cwd(), '.local', 'jtrader.sqlite');
mkdirSync(dirname(databasePath), {recursive: true});
const sqlite = new Database(databasePath);
const migrations = ['0001_init.sql', '0002_course.sql', '0003_admin_city.sql', '0004_admin_account.sql', '0005_course_settings.sql', '0006_courses_and_lesson_course.sql', '0007_admin_temporary_password.sql', '0008_student_contact.sql', '0009_community_image_section.sql','0010_offer_settings.sql','0011_admin_password_update.sql','0012_admin_password_100k.sql','0013_lesson_progress.sql'];
sqlite.exec('CREATE TABLE IF NOT EXISTS _local_migrations(name TEXT PRIMARY KEY)');
const lessonColumns = sqlite.query('PRAGMA table_info(lessons)').all() as Array<{name: string}>;
if (lessonColumns.some(column => column.name === 'course_id')) {
  for (const migration of migrations.slice(0, 7)) {
    sqlite.query('INSERT OR IGNORE INTO _local_migrations(name) VALUES(?)').run(migration);
  }
}

for (const migration of migrations) {
  if (sqlite.query('SELECT 1 FROM _local_migrations WHERE name=?').get(migration)) continue;
  const sql = readFileSync(join(process.cwd(), 'migrations', migration), 'utf8').trim();
  if (sql && !sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '').trim()) continue;
  if (sql) sqlite.exec(sql);
  sqlite.query('INSERT OR IGNORE INTO _local_migrations(name) VALUES(?)').run(migration);
}

function prepare(sql: string): Statement {
  let values: unknown[] = [];
  return {
    bind: (...nextValues) => { values = nextValues; return prepareBound(sql, () => values); },
    all: async () => ({results: sqlite.query(sql).all()}),
    first: async <T>() => (sqlite.query(sql).get() as T | null),
    run: async () => sqlite.query(sql).run(),
  };
}

function prepareBound(sql: string, getValues: () => unknown[]): Statement {
  return {
    bind: (...nextValues) => prepareBound(sql, () => nextValues),
    all: async () => ({results: sqlite.query(sql).all(...getValues())}),
    first: async <T>() => (sqlite.query(sql).get(...getValues()) as T | null),
    run: async () => sqlite.query(sql).run(...getValues()),
  };
}

function parseDevVars(): Record<string, string> {
  try {
    const content = readFileSync(join(process.cwd(), '.dev.vars'), 'utf8');
    const vars: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      vars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
    return vars;
  } catch {
    return {};
  }
}

const devVars = parseDevVars();

export const env = {
  DB: {prepare},
  RAZORPAY_KEY_ID: devVars.RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: devVars.RAZORPAY_KEY_SECRET ?? process.env.RAZORPAY_KEY_SECRET,
};

