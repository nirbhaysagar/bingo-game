-- Migration V6: Add grid_size to games table
-- Run this in Supabase SQL Editor to support 5x5 and 6x6 grid sizes

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS grid_size INTEGER NOT NULL DEFAULT 5 CHECK (grid_size IN (5, 6));
