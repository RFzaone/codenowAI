CREATE TABLE IF NOT EXISTS redeem_codes (
  code TEXT PRIMARY KEY,
  plan TEXT NOT NULL CHECK(plan IN ('plus','pro')),
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  redeemed_at TEXT,
  redeemed_by TEXT
);

CREATE TABLE IF NOT EXISTS user_plans (
  user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL CHECK(plan IN ('free','plus','pro')),
  updated_at TEXT NOT NULL
);
