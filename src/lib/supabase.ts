import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Copy .env.example to .env and fill in your credentials.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── Type helpers ───────────────────────────────────────────────────────────

export interface Game {
  id: string
  room_code: string
  status: 'waiting' | 'playing' | 'finished'
  host_id: string
  called_numbers: number[]
  winner_id: string | null
  created_at: string
  next_room_code?: string | null
  target_lines: number
  game_mode?: 'auto' | 'manual'
  current_turn_player_id?: string | null
  grid_size: number
  game_style?: 'simple' | 'authentic'
}

export interface GamePlayer {
  id: string
  game_id: string
  player_id: string
  player_name: string
  card: number[]
  marked_numbers: number[]
  lines_count: number
  joined_at: string
}

export interface GameHistory {
  id: string
  game_id: string
  room_code: string
  winner_name: string
  player_count: number
  numbers_called: number[]
  player_cards: Array<{
    name: string
    card: number[]
    lines: number
  }>
  played_at: string
}
