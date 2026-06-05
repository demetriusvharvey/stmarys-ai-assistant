-- =============================================================
-- St. Mary's AI Assistant — DB Migrations
-- Run this entire file in pgAdmin Query Tool
-- =============================================================

-- 1. Action logs table (fixes "Audit log write failed" errors)
CREATE TABLE IF NOT EXISTS action_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_email  TEXT,
  action      TEXT NOT NULL,
  route       TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_action_logs_created_at ON action_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_action ON action_logs (action);

-- 2. Knowledge gaps table (tracks unanswered questions)
CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id          BIGSERIAL PRIMARY KEY,
  question    TEXT NOT NULL,
  user_email  TEXT,
  agent       TEXT,
  flagged_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status      TEXT NOT NULL DEFAULT 'open',   -- open | resolved | ignored
  notes       TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_status ON knowledge_gaps (status);
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_flagged_at ON knowledge_gaps (flagged_at DESC);

-- Done!
SELECT 'Migrations applied successfully' AS result;
