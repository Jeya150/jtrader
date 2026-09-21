CREATE TABLE IF NOT EXISTS offer_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  cycle_hours REAL NOT NULL DEFAULT 9,
  basic_old_price INTEGER NOT NULL DEFAULT 2000,
  option_old_price INTEGER NOT NULL DEFAULT 13000,
  banner_title TEXT NOT NULL DEFAULT 'Build your market edge.'
);
INSERT OR IGNORE INTO offer_settings(id,enabled,cycle_hours,basic_old_price,option_old_price,banner_title)
VALUES(1,1,9,2000,13000,'Build your market edge.');
