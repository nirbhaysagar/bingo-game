-- Run this in Supabase SQL Editor to add marked_numbers per player
-- (Run this if you already ran the original migration)

ALTER TABLE game_players
  ADD COLUMN IF NOT EXISTS marked_numbers INTEGER[] NOT NULL DEFAULT '{}';
