
interface CalledNumbersProps {
  numbers: number[]
}

export function CalledNumbers({ numbers }: CalledNumbersProps) {

  return (
    <div className="called-numbers-list">
      {numbers.length === 0 ? (
        <span className="text-muted text-sm">No numbers called yet</span>
      ) : (
        [...numbers].reverse().map((n, idx) => (
          <div
            key={n}
            className={`called-number-chip ${idx === 0 ? 'latest' : ''}`}
            title={`Called ${numbers.indexOf(n) + 1}${['st','nd','rd'][numbers.indexOf(n)] || 'th'}`}
          >
            {n}
          </div>
        ))
      )}
    </div>
  )
}
