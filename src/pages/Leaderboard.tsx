import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, type GameHistory } from '../lib/supabase'

interface PlayerStats {
  name: string
  wins: number
  gamesPlayed: number
  winRate: number
}

function formatWinRate(rate: number): string {
  const pct = rate * 100
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`
}

const MEDALS = ['🥇', '🥈', '🥉']

export default function Leaderboard() {
  const navigate = useNavigate()
  const [players, setPlayers] = useState<PlayerStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('game_history')
        .select('*')
        .order('played_at', { ascending: false })
        .limit(500)

      const rows = (data as GameHistory[]) ?? []

      const stats = new Map<string, PlayerStats>()

      for (const row of rows) {
        const participants = new Set<string>()

        const cards = (row.player_cards ?? []) as Array<{ name?: string }>
        for (const p of cards) {
          if (p?.name) participants.add(p.name)
        }
        if (row.winner_name) participants.add(row.winner_name)

        for (const name of participants) {
          const existing = stats.get(name) ?? { name, wins: 0, gamesPlayed: 0, winRate: 0 }
          existing.gamesPlayed += 1
          stats.set(name, existing)
        }

        const winner = stats.get(row.winner_name)
        if (winner) winner.wins += 1
      }

      const ranked = Array.from(stats.values())
        .map((s) => ({ ...s, winRate: s.gamesPlayed > 0 ? s.wins / s.gamesPlayed : 0 }))
        .sort((a, b) =>
          b.wins - a.wins ||
          b.winRate - a.winRate ||
          b.gamesPlayed - a.gamesPlayed ||
          a.name.localeCompare(b.name)
        )

      setPlayers(ranked)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="page">
        <div className="loading-spinner">
          <div className="spinner" />
          <span>Loading leaderboard...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page-top">
      {/* Nav */}
      <div className="nav-bar">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
          ← Back
        </button>
        <span className="nav-logo">BINGO</span>
        <div style={{ width: 80 }} />
      </div>

      <div className="container" style={{ padding: '32px 16px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1>🏆 Leaderboard</h1>
          <p className="text-muted text-sm" style={{ marginTop: 6 }}>
            {players.length} player{players.length !== 1 ? 's' : ''} · ranked by wins
          </p>
        </div>

        {players.length === 0 ? (
          <div className="card card-padded text-center flex flex-col gap-16">
            <div style={{ fontSize: '3rem' }}>🏆</div>
            <h2 style={{ color: 'var(--text-secondary)' }}>No winners yet</h2>
            <p className="text-muted text-sm">Play a game and the results will show up here.</p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              Play a Game
            </button>
          </div>
        ) : (
          <div className="leaderboard-list">
            {players.map((p, idx) => (
              <div
                key={p.name}
                className={`leaderboard-row ${idx < 3 ? 'leaderboard-top' : ''}`}
              >
                <div className="leaderboard-rank">
                  {idx < 3 ? (
                    <span className="leaderboard-medal">{MEDALS[idx]}</span>
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>

                <div className="leaderboard-name">{p.name}</div>

                <div className="leaderboard-stats">
                  <div className="leaderboard-stat">
                    <div className="leaderboard-stat-value leaderboard-stat-wins">{p.wins}</div>
                    <div className="leaderboard-stat-label">Wins</div>
                  </div>
                  <div className="leaderboard-stat">
                    <div className="leaderboard-stat-value">{p.gamesPlayed}</div>
                    <div className="leaderboard-stat-label">Games</div>
                  </div>
                  <div className="leaderboard-stat">
                    <div className="leaderboard-stat-value">{formatWinRate(p.winRate)}</div>
                    <div className="leaderboard-stat-label">Win Rate</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
