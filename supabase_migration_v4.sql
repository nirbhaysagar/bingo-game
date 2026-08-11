-- Run this in Supabase SQL Editor to add target_lines to games
-- (Run this if you already ran the previous migrations)

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS target_lines INTEGER NOT NULL DEFAULT 5;
