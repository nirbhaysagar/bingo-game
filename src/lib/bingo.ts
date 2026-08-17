/**
 * Pure Bingo game logic — no side effects, fully testable.
 */

// ─── Card Generation ─────────────────────────────────────────────────────────

/** Returns a shuffled array of 1–25 as a 5×5 bingo card (flat array, row-major). */
export function generateCard(size: number = 5): number[] {
  const total = size * size
  const nums = Array.from({ length: total }, (_, i) => i + 1)
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
export function getCompletedLines(card: number[], calledNumbers: number[], size: number = 5): number[] {
  const called = new Set(calledNumbers)
  const completed: number[] = []

  // Helper: is cell at (row, col) marked?
  const marked = (row: number, col: number) => called.has(card[row * size + col])

  // Rows
  for (let r = 0; r < size; r++) {
    let rowCompleted = true
    for (let c = 0; c < size; c++) {
      if (!marked(r, c)) {
        rowCompleted = false
        break
      }
    }
    if (rowCompleted) completed.push(r)
  }

  // Columns
  for (let c = 0; c < size; c++) {
    let colCompleted = true
    for (let r = 0; r < size; r++) {
      if (!marked(r, c)) {
        colCompleted = false
        break
      }
    }
    if (colCompleted) completed.push(size + c)
  }

  // Diagonal ↘
  let diag1Completed = true
  for (let i = 0; i < size; i++) {
    if (!marked(i, i)) {
      diag1Completed = false
      break
    }
  }
  if (diag1Completed) completed.push(size * 2)

  // Diagonal ↙
  let diag2Completed = true
  for (let i = 0; i < size; i++) {
    if (!marked(i, size - 1 - i)) {
      diag2Completed = false
      break
    }
  }
  if (diag2Completed) completed.push(size * 2 + 1)

  return completed
}

export function countLines(card: number[], calledNumbers: number[], size: number = 5): number {
  return getCompletedLines(card, calledNumbers, size).length
}

export function checkWin(lines: number, targetLines: number = 5): boolean {
  return lines >= targetLines
}

/** Returns which cells belong to completed lines. */
export function getHighlightedCells(card: number[], calledNumbers: number[], size: number = 5): Set<number> {
  const completedLines = getCompletedLines(card, calledNumbers, size)
  const cells = new Set<number>()

  for (const lineIdx of completedLines) {
    if (lineIdx < size) {
      // Row
      for (let c = 0; c < size; c++) cells.add(lineIdx * size + c)
    } else if (lineIdx < size * 2) {
      // Column
      const col = lineIdx - size
      for (let r = 0; r < size; r++) cells.add(r * size + col)
    } else if (lineIdx === size * 2) {
      // Diagonal ↘
      for (let i = 0; i < size; i++) cells.add(i * size + i)
    } else {
      // Diagonal ↙
      for (let i = 0; i < size; i++) cells.add(i * size + (size - 1 - i))
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
