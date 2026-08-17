-- Migration V7: Add game_style to games table
-- Run this in Supabase SQL Editor to support 'simple' and 'authentic' game styles

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS game_style TEXT NOT NULL DEFAULT 'simple' CHECK (game_style IN ('simple', 'authentic'));
