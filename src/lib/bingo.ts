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

function getRandomNumbers(min: number, max: number, count: number): number[] {
  const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[nums[i], nums[j]] = [nums[j], nums[i]]
  }
  return nums.slice(0, count)
}

/** Returns a traditional 75-ball 5x5 card with a Free Space (0) at the center. */
export function generateAuthenticCard(): number[] {
  const b = getRandomNumbers(1, 15, 5)
  const i = getRandomNumbers(16, 30, 5)
  const n = getRandomNumbers(31, 45, 5)
  const g = getRandomNumbers(46, 60, 5)
  const o = getRandomNumbers(61, 75, 5)

  n[2] = 0 // Free Space

  const card = new Array(25)
  for (let row = 0; row < 5; row++) {
    card[row * 5 + 0] = b[row]
    card[row * 5 + 1] = i[row]
    card[row * 5 + 2] = n[row]
    card[row * 5 + 3] = g[row]
    card[row * 5 + 4] = o[row]
  }
  return card
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

  // Helper: is cell at (row, col) marked? (0 is free space)
  const marked = (row: number, col: number) => {
    const val = card[row * size + col]
    return val === 0 || called.has(val)
  }

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

export function formatBingoNumber(num: number, isAuthentic?: boolean): string {
  if (!isAuthentic) return String(num)
  if (num <= 15) return `B-${num}`
  if (num <= 30) return `I-${num}`
  if (num <= 45) return `N-${num}`
  if (num <= 60) return `G-${num}`
  return `O-${num}`
}
