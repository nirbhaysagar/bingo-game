-- Run this in Supabase SQL Editor to support Rematch redirect for all players
-- (Run this if you already ran the previous migrations)

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS next_room_code TEXT;
