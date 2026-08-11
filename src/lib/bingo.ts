/**
 * Pure Bingo game logic — no side effects, fully testable.
 */

// ─── Card Generation ─────────────────────────────────────────────────────────

/** Returns a shuffled array of 1–25 as a 5×5 bingo card (flat array, row-major). */
export function generateCard(): number[] {
  const nums = Array.from({ length: 25 }, (_, i) => i + 1)
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[nums[i], nums[j]] = [nums[j], nums[i]]
  }
  return nums
}

// ─── Room Code ───────────────────────────────────────────────────────────────

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // omit O, 0, I, 1 for clarity

export function generateRoomCode(): string {
  return Array.from({ length: 5 }, () =>
    CHARS.charAt(Math.floor(Math.random() * CHARS.length))
  ).join('')
}

// ─── Line Detection ──────────────────────────────────────────────────────────

/**
 * Returns a list of all completed line indices (0-11) on a 5×5 card.
 *
 * Line index layout:
 *   0-4   → rows 0-4
 *   5-9   → cols 0-4
 *   10    → diagonal top-left → bottom-right
 *   11    → diagonal top-right → bottom-left
 */
export function getCompletedLines(card: number[], calledNumbers: number[]): number[] {
  const called = new Set(calledNumbers)
  const completed: number[] = []

  // Helper: is cell at (row, col) marked?
  const marked = (row: number, col: number) => called.has(card[row * 5 + col])

  // Rows
  for (let r = 0; r < 5; r++) {
    if ([0, 1, 2, 3, 4].every((c) => marked(r, c))) completed.push(r)
  }

  // Columns
  for (let c = 0; c < 5; c++) {
    if ([0, 1, 2, 3, 4].every((r) => marked(r, c))) completed.push(5 + c)
  }

  // Diagonal ↘
  if ([0, 1, 2, 3, 4].every((i) => marked(i, i))) completed.push(10)

  // Diagonal ↙
  if ([0, 1, 2, 3, 4].every((i) => marked(i, 4 - i))) completed.push(11)

  return completed
}

export function countLines(card: number[], calledNumbers: number[]): number {
  return getCompletedLines(card, calledNumbers).length
}

export function checkWin(lines: number): boolean {
  return lines >= 5
}

/** Returns which cells (indices 0-24) belong to completed lines. */
export function getHighlightedCells(card: number[], calledNumbers: number[]): Set<number> {
  const completedLines = getCompletedLines(card, calledNumbers)
  const cells = new Set<number>()

  for (const lineIdx of completedLines) {
    if (lineIdx < 5) {
      // Row
      for (let c = 0; c < 5; c++) cells.add(lineIdx * 5 + c)
    } else if (lineIdx < 10) {
      // Column
      const col = lineIdx - 5
      for (let r = 0; r < 5; r++) cells.add(r * 5 + col)
    } else if (lineIdx === 10) {
      // Diagonal ↘
      for (let i = 0; i < 5; i++) cells.add(i * 5 + i)
    } else {
      // Diagonal ↙
      for (let i = 0; i < 5; i++) cells.add(i * 5 + (4 - i))
    }
  }

  return cells
}

// ─── Player ID (localStorage) ─────────────────────────────────────────────────

export function getOrCreatePlayerId(): string {
  let id = localStorage.getItem('bingo_player_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('bingo_player_id', id)
  }
  return id
}

export function getPlayerName(): string {
  return localStorage.getItem('bingo_player_name') || ''
}

export function setPlayerName(name: string): void {
  localStorage.setItem('bingo_player_name', name)
}
