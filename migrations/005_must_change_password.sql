-- Migration 005: Add must_change_password flag for temp-password accounts
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
