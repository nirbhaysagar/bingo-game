import { useState } from 'react'
import { getHighlightedCells } from '../lib/bingo'
import { playError } from '../lib/audio'

interface BingoCardProps {
  card: number[]
  calledNumbers: number[]       // numbers called by the engine or players
  markedNumbers: number[]       // numbers the player manually marked
  latestNumber?: number | null
  gameMode?: 'auto' | 'manual'
  isMyTurn?: boolean
  onMark?: (num: number) => void // called when player clicks a called cell to mark it
  onSelectNumber?: (num: number) => void // called when active player selects an uncalled cell on their turn
}

export function BingoCard({
  card,
  calledNumbers,
  markedNumbers,
  latestNumber,
  gameMode = 'auto',
  isMyTurn = false,
  onMark,
  onSelectNumber,
}: BingoCardProps) {
  const calledSet   = new Set(calledNumbers)
  const markedSet   = new Set(markedNumbers)
  const highlighted = getHighlightedCells(card, markedNumbers) // lines from MARKED cells

  // Track which cell indexes are currently wobbling
  const [wobbling, setWobbling] = useState<Set<number>>(new Set())

  const triggerWobble = (idx: number) => {
    playError()
    setWobbling((prev) => {
      const next = new Set(prev)
      next.add(idx)
      return next
    })

    setTimeout(() => {
      setWobbling((prev) => {
        const next = new Set(prev)
        next.delete(idx)
        return next
      })
    }, 300)
  }

  const handleCellClick = (num: number, idx: number) => {
    const isCalled = calledSet.has(num)
    const isMarked = markedSet.has(num)

    if (isMarked) return // do nothing for already marked numbers

    if (isCalled) {
      onMark?.(num)
    } else if (gameMode === 'manual') {
      if (isMyTurn) {
        onSelectNumber?.(num)
      } else {
        triggerWobble(idx)
      }
    } else {
      triggerWobble(idx)
    }
  }

  return (
    <div className={`bingo-card grid-${card.length === 36 ? 6 : 5} ${gameMode === 'manual' && isMyTurn ? 'my-turn-card' : ''}`}>
      {card.map((num, idx) => {
        const isCalled      = calledSet.has(num)
        const isMarked      = markedSet.has(num)
        const isHighlighted = highlighted.has(idx)
        const isLatest      = num === latestNumber
        const isWobbling    = wobbling.has(idx)

        let className = 'bingo-cell'
        if (isHighlighted)       className += ' highlighted'
        else if (isMarked)       className += ' marked'
        else if (isCalled)       className += ' called-unselected'

        if (isLatest && !isMarked) className += ' just-called'
        if (!isMarked)           className += ' clickable'
        if (isWobbling)          className += ' wobble-error'
        if (gameMode === 'manual' && isMyTurn && !isCalled && !isMarked) {
          className += ' turn-pickable'
        }

        let titleText = undefined
        if (isCalled && !isMarked) {
          titleText = 'Click to mark!'
        } else if (!isMarked) {
          if (gameMode === 'manual') {
            titleText = isMyTurn ? `Tap ${num} to choose this number for your turn!` : 'Wait for your turn to choose!'
          } else {
            titleText = 'Not called yet!'
          }
        }

        return (
          <div
            key={idx}
            className={className}
            onClick={() => handleCellClick(num, idx)}
            title={titleText}
          >
            <span className="cell-num">{num}</span>
            {isMarked && <span className="cell-mark">✕</span>}
            {gameMode === 'manual' && isMyTurn && !isCalled && !isMarked && (
              <span className="pick-badge">PICK</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
