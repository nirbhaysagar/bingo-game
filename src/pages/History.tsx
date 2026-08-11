import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, type GameHistory } from '../lib/supabase'

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function History() {
  const navigate = useNavigate()
  const [history, setHistory] = useState<GameHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<GameHistory | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('game_history')
        .select('*')
        .order('played_at', { ascending: false })
        .limit(50)
      setHistory((data as GameHistory[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="page">
        <div className="loading-spinner">
          <div className="spinner" />
          <span>Loading history...</span>
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
          <h1>Game History</h1>
          <p className="text-muted text-sm" style={{ marginTop: 6 }}>
            {history.length} game{history.length !== 1 ? 's' : ''} played
          </p>
        </div>

        {history.length === 0 ? (
          <div className="card card-padded text-center flex flex-col gap-16">
            <div style={{ fontSize: '3rem' }}>📋</div>
            <h2 style={{ color: 'var(--text-secondary)' }}>No games yet</h2>
            <p className="text-muted text-sm">Completed games will appear here.</p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              Play a Game
            </button>
          </div>
        ) : (
          <div className="history-list">
            {history.map((h) => (
              <div
                key={h.id}
                className="history-item"
                onClick={() => setSelected(selected?.id === h.id ? null : h)}
              >
                <div className="history-trophy">🏆</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="history-winner">{h.winner_name}</div>
                  <div className="history-meta">
                    {h.player_count} players · {h.numbers_called.length} numbers called
                  </div>
                  <div className="history-meta">{formatDate(h.played_at)}</div>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {selected?.id === h.id ? '▲' : '▼'}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Expanded detail */}
        {selected && (
          <div className="card card-padded fade-in" style={{ marginTop: 16 }}>
            <h2 style={{ marginBottom: 16 }}>
              🏆 {selected.winner_name} · {formatDate(selected.played_at)}
            </h2>

            <div className="section-title" style={{ marginBottom: 8 }}>Called Numbers ({selected.numbers_called.length})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
              {selected.numbers_called.map((n, idx) => (
                <span key={idx} style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                }}>
                  {n}
                </span>
              ))}
            </div>

            <div className="section-title" style={{ marginBottom: 8 }}>Players</div>
            {(selected.player_cards as Array<{ name: string; card: number[]; lines: number }>)
              .slice()
              .sort((a, b) => b.lines - a.lines)
              .map((p, idx) => (
                <div key={idx} style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, color: p.name === selected.winner_name ? 'var(--accent)' : 'var(--text-primary)' }}>
                    {p.name === selected.winner_name ? '🏆 ' : ''}{p.name} — {p.lines} / 5 lines
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
