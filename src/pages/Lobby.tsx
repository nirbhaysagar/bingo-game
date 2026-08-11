import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, type Game, type GamePlayer } from '../lib/supabase'
import { getOrCreatePlayerId } from '../lib/bingo'

const AVATAR_COLORS = ['avatar-0', 'avatar-1', 'avatar-2', 'avatar-3']

export default function Lobby() {
  const { roomCode } = useParams<{ roomCode: string }>()
  const navigate = useNavigate()
  const playerId = getOrCreatePlayerId()

  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<GamePlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const gameIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!roomCode) return
    // Unique suffix prevents 'already subscribed' error on hot reload / remount
    const uid = Date.now()
    let gameChannel:    ReturnType<typeof supabase.channel> | null = null
    let playersChannel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    const load = async () => {
      const { data: gameData, error: gErr } = await supabase
        .from('games')
        .select('*')
        .eq('room_code', roomCode.toUpperCase())
        .single()

      if (cancelled) return
      if (gErr || !gameData) { setError('Room not found.'); setLoading(false); return }

      if (gameData.status === 'playing')  { navigate(`/game/${roomCode}`); return }
      if (gameData.status === 'finished') { navigate(`/winner/${roomCode}`); return }

      setGame(gameData as Game)
      gameIdRef.current = gameData.id

      const { data: pData } = await supabase
        .from('game_players')
        .select('*')
        .eq('game_id', gameData.id)
        .order('joined_at')

      if (cancelled) return
      setPlayers((pData as GamePlayer[]) ?? [])
      setLoading(false)

      // Subscribe with unique channel names
      gameChannel = supabase
        .channel(`lobby-game-${gameData.id}-${uid}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameData.id}` },
          (payload) => {
            const updated = payload.new as Game
            setGame(updated)
            if (updated.status === 'playing') navigate(`/game/${roomCode}`)
          }
        )
        .subscribe()

      playersChannel = supabase
        .channel(`lobby-players-${gameData.id}-${uid}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameData.id}` },
          async () => {
            const { data } = await supabase
              .from('game_players')
              .select('*')
              .eq('game_id', gameData.id)
              .order('joined_at')
            if (!cancelled) setPlayers((data as GamePlayer[]) ?? [])
          }
        )
        .subscribe()
    }

    load()
    return () => {
      cancelled = true
      if (gameChannel)    supabase.removeChannel(gameChannel)
      if (playersChannel) supabase.removeChannel(playersChannel)
    }
  }, [roomCode, navigate])

  const isHost = game?.host_id === playerId
  const canStart = players.length >= 2

  const handleStart = async () => {
    if (!game) return
    setError('')
    setStarting(true)

    const mode = game.game_mode || (roomCode ? sessionStorage.getItem(`bingo_mode_${roomCode.toUpperCase()}`) : null) || 'auto'
    if (roomCode) {
      sessionStorage.setItem(`bingo_mode_${roomCode.toUpperCase()}`, mode as string)
    }

    const updatePayload: Record<string, unknown> = {
      status: 'playing',
      game_mode: mode,
    }
    if (mode === 'manual' && players.length > 0) {
      updatePayload.current_turn_player_id = players[0].player_id
    }

    const { error: primaryErr } = await supabase.from('games').update(updatePayload).eq('id', game.id)

    if (primaryErr) {
      console.warn('Full start update failed, falling back to status-only update:', primaryErr)
      const { error: fallbackErr } = await supabase.from('games').update({ status: 'playing' }).eq('id', game.id)
      if (fallbackErr) {
        setError(`Failed to start game: ${fallbackErr.message}`)
        setStarting(false)
        return
      }
    }

    setStarting(false)
    if (roomCode) {
      navigate(`/game/${roomCode}`)
    }
  }

  const handleModeChange = async (mode: 'auto' | 'manual') => {
    if (!game || !isHost) return
    setGame((prev) => (prev ? { ...prev, game_mode: mode } : null))
    if (roomCode) {
      sessionStorage.setItem(`bingo_mode_${roomCode.toUpperCase()}`, mode)
    }
    await supabase.from('games').update({ game_mode: mode }).eq('id', game.id)
  }

  const handleTargetChange = async (lines: number) => {
    if (!game || !isHost) return
    setGame((prev) => prev ? { ...prev, target_lines: lines } : null)
    await supabase
      .from('games')
      .update({ target_lines: lines })
      .eq('id', game.id)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(roomCode ?? '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading-spinner">
          <div className="spinner" />
          <span>Loading lobby...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <div className="card card-padded text-center flex flex-col gap-16" style={{ maxWidth: 400 }}>
          <div style={{ fontSize: '2rem' }}>😕</div>
          <div className="error-msg">{error}</div>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>Back to Home</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div style={{ width: '100%', maxWidth: 520 }} className="fade-in">
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div className="logo" style={{ fontSize: '1.8rem', letterSpacing: '0.2em' }}>BINGO</div>
          <h1 style={{ marginTop: 8, marginBottom: 4, fontSize: '1.4rem' }}>Game Lobby</h1>
          <div className="text-muted text-sm">
            {isHost ? 'Share the code with your friends' : 'Waiting for the host to start...'}
          </div>
        </div>

        {/* Room Code & Settings */}
        <div className="card flex flex-col gap-16" style={{ padding: '20px 24px', marginBottom: 12 }}>
          <div>
            <div className="section-title" style={{ marginBottom: 6 }}>Room Code</div>
            <div className="room-code-display" style={{ padding: '12px 16px' }}>
              <span className="room-code-text" style={{ fontSize: '1.8rem' }}>{roomCode}</span>
              <button
                id="btn-copy-code"
                className="btn btn-sm btn-secondary"
                onClick={handleCopy}
                style={{ flexShrink: 0 }}
              >
                {copied ? '✓ Copied!' : '⎘ Copy'}
              </button>
            </div>
          </div>

          {/* Win Target Settings */}
          <div>
            <div className="section-title" style={{ marginBottom: 8 }}>Target to Win</div>
            {isHost ? (
              <div className="flex gap-8">
                {[1, 3, 5].map((lines) => (
                  <button
                    key={lines}
                    className={`btn btn-sm flex-1 ${game?.target_lines === lines ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handleTargetChange(lines)}
                    style={{ padding: '10px 14px', fontSize: '0.85rem' }}
                  >
                    {lines === 5 ? '5 Lines (Full)' : `${lines} Line${lines !== 1 ? 's' : ''}`}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center" style={{
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                fontWeight: 700,
                fontSize: '0.9rem'
              }}>
                🎯 First to complete{' '}
                <span style={{ color: 'var(--accent)' }}>
                  {game?.target_lines === 5 ? '5 Lines (Full Card)' : `${game?.target_lines} Line${game?.target_lines !== 1 ? 's' : ''}`}
                </span>{' '}
                wins!
              </div>
            )}
          </div>

          {/* Play Mode Settings */}
          <div>
            <div className="section-title" style={{ marginBottom: 8 }}>Game Mode</div>
            {isHost ? (
              <div className="flex gap-8">
                <button
                  type="button"
                  className={`btn btn-sm flex-1 ${game?.game_mode !== 'manual' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleModeChange('auto')}
                  style={{ padding: '10px 12px', fontSize: '0.85rem' }}
                >
                  🎲 Auto Call
                </button>
                <button
                  type="button"
                  className={`btn btn-sm flex-1 ${game?.game_mode === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleModeChange('manual')}
                  style={{ padding: '10px 12px', fontSize: '0.85rem' }}
                >
                  🖐️ Manual Turn-Based
                </button>
              </div>
            ) : (
              <div className="text-center" style={{
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: '0.85rem'
              }}>
                Mode:{' '}
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                  {game?.game_mode === 'manual' ? '🖐️ Manual Turn-Based (Players pick 1-by-1)' : '🎲 Auto Call (Random Generator)'}
                </span>
              </div>
            )}
          </div>

          {/* Players */}
          <div>
            <div className="section-title" style={{ marginBottom: 8 }}>
              Players — {players.length} / 4
            </div>
            <div className="lobby-players">
              {players.map((p, idx) => (
                <div key={p.id} className="lobby-player-row" style={{ padding: '10px 12px' }}>
                  <div className={`player-avatar ${AVATAR_COLORS[idx % 4]}`} style={{ width: 28, height: 28, fontSize: '0.75rem' }}>
                    {p.player_name.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 600, flex: 1, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.player_name}
                    {p.player_id === playerId && (
                      <span className="text-muted text-sm" style={{ marginLeft: 4, fontSize: '0.75rem' }}>you</span>
                    )}
                  </span>
                  {p.player_id === game?.host_id && (
                    <span className="host-badge" style={{ fontSize: '0.6rem', padding: '1px 4px' }}>host</span>
                  )}
                </div>
              ))}

              {/* Empty slots */}
              {Array.from({ length: Math.max(0, 4 - players.length) }).map((_, i) => (
                <div key={`empty-${i}`} style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--border)',
                  color: 'var(--text-muted)',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px dashed var(--border)',
                  }} />
                  Waiting...
                </div>
              ))}
            </div>
          </div>

          {/* Waiting indicator */}
          {!isHost && (
            <div style={{ textAlign: 'center', marginTop: 4 }}>
              <div className="waiting-dots">
                <span /><span /><span />
              </div>
              <div className="text-muted text-sm" style={{ marginTop: 6 }}>
                Waiting for host to start
              </div>
            </div>
          )}

          {/* Start button for host */}
          {isHost && (
            <div className="flex flex-col gap-12" style={{ marginTop: 4 }}>
              {!canStart && (
                <div className="error-msg" style={{ background: 'rgba(255,255,255,0.05)', color: '#ffffff', borderColor: 'rgba(255,255,255,0.25)', padding: '8px 12px', fontSize: '0.8rem' }}>
                  Need at least 2 players to start
                </div>
              )}
              <button
                id="btn-start-game"
                className="btn btn-primary btn-lg btn-full"
                onClick={handleStart}
                disabled={!canStart || starting}
                style={{ padding: '12px 24px', fontSize: '0.95rem' }}
              >
                {starting ? (
                  <>
                    <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    Starting...
                  </>
                ) : (
                  `▶ Start Game (${players.length} Players)`
                )}
              </button>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
            ← Leave Room
          </button>
        </div>
      </div>
    </div>
  )
}
