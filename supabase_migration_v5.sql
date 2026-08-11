-- Run this in Supabase SQL Editor to add manual turn mode support
-- (Run this if you already ran previous migrations)

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS game_mode TEXT NOT NULL DEFAULT 'auto' CHECK (game_mode IN ('auto', 'manual')),
  ADD COLUMN IF NOT EXISTS current_turn_player_id UUID;
