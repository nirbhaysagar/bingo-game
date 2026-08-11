# Bingo V1 — Setup & Walkthrough

## What Was Built

A complete real-time multiplayer Bingo game with:
- **5 screens**: Home, Lobby, Game, Winner, History
- **Real-time sync** via Supabase Postgres Changes
- **Space Monochromatic UI**: Pitch black space backdrop with scatter-starfield pattern, glowing white cells, and minimalist dashboard interface fitting entirely within a single `100vh` viewport (no scrolling).
- **Toggleable Retro SFX**: Built-in sound synthesizers utilizing the native Web Audio API (no assets to download):
  - Sonar sweep ping for called numbers.
  - High-frequency tick when marking a cell.
  - Rising arpeggio chord when completing a line.
  - Triumph LFO fanfare arpeggio on the winner's screen.
- **Mute Control**: In-game 🔊/🔇 toggle in the header navigation that persists across browser sessions.
- **Game history** persisted to Supabase.

---

## ⚡ Setup — 3 Steps Required

### Step 1 — Fill in Supabase Credentials

Edit [.env](file:///c:/Users/DELL/Desktop/bingo/.env) with your actual credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Get these from: **Supabase Dashboard → Settings → API**

### Step 2 — Run the SQL Migrations

Make sure to run **all three SQL migrations** in the **Supabase Dashboard → SQL Editor → New Query → Run**:
1. [supabase_migration.sql](file:///c:/Users/DELL/Desktop/bingo/supabase_migration.sql) (Creates the base tables)
2. [supabase_migration_v2.sql](file:///c:/Users/DELL/Desktop/bingo/supabase_migration_v2.sql) (Adds player manual marking column)
3. [supabase_migration_v3.sql](file:///c:/Users/DELL/Desktop/bingo/supabase_migration_v3.sql) (Adds rematch room coordination column)

### Step 3 — Start the App

```bash
npm run dev
```

Open **http://localhost:5173**

---

## 🎮 How to Play

1. **Player 1** opens the app, enters their name, clicks **Create Game**.
2. A **room code** appears in the lobby (e.g. `2XCY9`) — share this with friends.
3. **Players 2–4** open the app, enter their name, type the room code, click **Join with Code**.
4. Once 2–4 players are in the lobby, **the host clicks Start Game**.
5. Everyone gets their own shuffled 5×5 card automatically.
6. **Host clicks "🎱 Call Number"** — a random number from 1–25 is picked.
7. All grids update in real-time — called numbers pulse a white border.
8. **Click the pulsing cells** on your card to stamp them (turns solid white).
9. Completed lines are highlighted with a glowing white shadow.
10. The first player to complete **5 lines** wins the game.
11. Host can click **Play Again** to start a rematch; all players are automatically redirected to the new lobby.

---

## File Structure

```
src/
  lib/
    supabase.ts      ← Supabase client + types
    bingo.ts         ← Game logic (cards, lines, win check)
    audio.ts         ← [NEW] Web Audio API synth sound generators
  components/
    BingoCard.tsx    ← 5×5 grid with marked/highlighted states
    PlayerList.tsx   ← Player rows with progress
    CalledNumbers.tsx← Called number chips
  pages/
    Home.tsx         ← Create/Join screen
    Lobby.tsx        ← Room code display, player grid, start button
    Game.tsx         ← 3-panel dashboard (caller, grid, progress)
    Winner.tsx       ← Winner screen with confetti and rematch button
    History.tsx      ← Past games from Supabase
```

---

## Database Schema

| Table | Purpose |
|---|---|
| `games` | One row per game: room code, status, called numbers, winner, next_room_code |
| `game_players` | One row per player: card, marked_numbers, lines_count |
| `game_history` | Archived after game ends: winner, all cards, called numbers |

> [!TIP]
> To test with two players on one machine, open two different browsers (e.g. Chrome + Edge) or use an incognito window — they each get separate `localStorage` player IDs.

> [!NOTE]
> The app works without any auth. Players are identified by a UUID stored in `localStorage`. Clearing localStorage will create a new player identity.
