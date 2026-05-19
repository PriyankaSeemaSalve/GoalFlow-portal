-- ═══════════════════════════════════════════════════════════════════════════════
-- GoalFlow Database Schema
-- Run this in: Supabase → SQL Editor → New query → Paste → Run
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Enable UUID generation ─────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  email          TEXT        UNIQUE NOT NULL,
  password_hash  TEXT        NOT NULL,
  role           TEXT        NOT NULL CHECK (role IN ('employee', 'manager', 'admin')),
  manager_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  dept           TEXT,
  avatar         TEXT,                          -- e.g. 'AS' for Aanya Sharma
  color          TEXT,                          -- hex colour for avatar chip
  session_token  TEXT,                          -- current active JWT (single session)
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Org Objectives ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_objectives (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  category   TEXT,
  year       INT  DEFAULT EXTRACT(YEAR FROM NOW()),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Goals ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT        NOT NULL,
  description       TEXT,
  owner_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status            TEXT        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','review','active','completed','archived')),
  priority          TEXT        NOT NULL DEFAULT 'medium'
                                CHECK (priority IN ('high','medium','low')),
  category          TEXT,
  progress          INT         NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  due_date          DATE,
  org_objective_id  UUID        REFERENCES org_objectives(id) ON DELETE SET NULL,
  quarter           TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Comments ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id    UUID        NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Check-ins ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checkins (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id    UUID        NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  progress   INT         NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  note       TEXT        NOT NULL,
  mood       TEXT        NOT NULL DEFAULT 'on-track'
                         CHECK (mood IN ('on-track','at-risk','blocked','ahead')),
  date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Audit Log ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT        NOT NULL,   -- CREATE, UPDATE, DELETE, APPROVE, LOGIN, etc.
  entity     TEXT        NOT NULL,   -- goal, checkin, comment, user
  entity_id  UUID,
  changes    JSONB       DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_goals_owner      ON goals     (owner_id);
CREATE INDEX IF NOT EXISTS idx_goals_status     ON goals     (status);
CREATE INDEX IF NOT EXISTS idx_comments_goal    ON comments  (goal_id);
CREATE INDEX IF NOT EXISTS idx_checkins_goal    ON checkins  (goal_id);
CREATE INDEX IF NOT EXISTS idx_audit_user       ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity     ON audit_log (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created    ON audit_log (created_at DESC);

-- ── auto-update updated_at on goals ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- Disable Row Level Security on all tables (we enforce auth in the API layer)
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE users          DISABLE ROW LEVEL SECURITY;
ALTER TABLE org_objectives DISABLE ROW LEVEL SECURITY;
ALTER TABLE goals          DISABLE ROW LEVEL SECURITY;
ALTER TABLE comments       DISABLE ROW LEVEL SECURITY;
ALTER TABLE checkins       DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log      DISABLE ROW LEVEL SECURITY;