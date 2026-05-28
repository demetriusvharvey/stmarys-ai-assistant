-- Migration 003: Add users table for staff authentication
-- Run this against your Postgres database before starting the app.

CREATE TABLE IF NOT EXISTS users (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255)  UNIQUE NOT NULL,
  display_name  VARCHAR(255)  NOT NULL,
  role          VARCHAR(50)   NOT NULL DEFAULT 'staff'
                              CHECK (role IN ('staff', 'it_staff', 'admin')),
  password_hash VARCHAR(255)  NOT NULL,
  is_active     BOOLEAN       NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
CREATE INDEX IF NOT EXISTS users_role_idx  ON users (role);
