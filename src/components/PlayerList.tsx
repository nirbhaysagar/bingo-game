
import type { GamePlayer } from '../lib/supabase'

interface PlayerListProps {
  players: GamePlayer[]
  myPlayerId: string
  hostId?: string
  targetLines?: number
}

const AVATAR_COLORS = ['avatar-0', 'avatar-1', 'avatar-2', 'avatar-3', 'avatar-4']

export function PlayerList({ players, myPlayerId, hostId, targetLines = 5 }: PlayerListProps) {
  return (
    <div>
      {players.map((p, idx) => {
        const isMe = p.player_id === myPlayerId
        const isHost = p.player_id === hostId
        const isWinning = p.lines_count >= targetLines

        return (
          <div key={p.id} className="player-row">
            <div className={`player-avatar ${AVATAR_COLORS[idx % 5]}`}>
              {p.player_name.charAt(0).toUpperCase()}
            </div>
            <span className={`player-name ${isMe ? 'you' : ''}`}>
              {p.player_name}
              {isMe && <span style={{ fontSize: '0.75rem', marginLeft: 6, color: 'var(--text-muted)' }}>you</span>}
              {isHost && (
                <span className="host-badge" style={{ marginLeft: 6 }}>host</span>
              )}
            </span>
            <span className={`player-lines ${isWinning ? 'winning' : ''}`}>
              {p.lines_count} / {targetLines}
            </span>
          </div>
        )
      })}
    </div>
  )
}
