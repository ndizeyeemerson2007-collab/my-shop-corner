-- Run this in Supabase SQL Editor
-- Stores which sellers a customer follows

CREATE TABLE IF NOT EXISTS seller_follows (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seller_follows_unique UNIQUE (user_id, seller_id)
);

CREATE INDEX IF NOT EXISTS idx_seller_follows_user_id ON seller_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_seller_follows_seller_id ON seller_follows(seller_id);

ALTER TABLE seller_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage seller follows" ON seller_follows;
CREATE POLICY "Service role can manage seller follows"
ON seller_follows FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
