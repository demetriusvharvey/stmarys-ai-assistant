-- Add user_id to conversations so each user only sees their own chats
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);
