-- Bingo V1 Database Migration
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)

-- Drop tables if re-running
DROP TABLE IF EXISTS game_history CASCADE;
DROP TABLE IF EXISTS game_players CASCADE;
DROP TABLE IF EXISTS games CASCADE;

-- =====================
-- GAMES TABLE
-- =====================
CREATE TABLE games (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code     TEXT UNIQUE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'waiting'
                  CHECK (status IN ('waiting', 'playing', 'finished')),
  host_id       UUID NOT NULL,
  called_numbers INTEGER[] NOT NULL DEFAULT '{}',
  winner_id     UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- GAME PLAYERS TABLE
-- =====================
CREATE TABLE game_players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL,
  player_name   TEXT NOT NULL,
  card          INTEGER[] NOT NULL,
  lines_count   INTEGER NOT NULL DEFAULT 0,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, player_id)
);

-- =====================
-- GAME HISTORY TABLE
-- =====================
CREATE TABLE game_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       UUID NOT NULL,
  room_code     TEXT NOT NULL,
  winner_name   TEXT NOT NULL,
  player_count  INTEGER NOT NULL,
  numbers_called INTEGER[] NOT NULL,
  player_cards  JSONB NOT NULL DEFAULT '[]',
  played_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- INDEXES
-- =====================
CREATE INDEX idx_games_room_code ON games(room_code);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_game_players_game_id ON game_players(game_id);
CREATE INDEX idx_game_history_played_at ON game_history(played_at DESC);

-- =====================
-- REALTIME
-- Enable realtime for both tables so all clients stay in sync
-- =====================
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE game_players;

-- =====================
-- ROW LEVEL SECURITY
-- Disabled for this private friends game (no auth required)
-- =====================
ALTER TABLE games DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_players DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_history DISABLE ROW LEVEL SECURITY;
