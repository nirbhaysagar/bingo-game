import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, type Game, type GamePlayer } from '../lib/supabase'
import { getOrCreatePlayerId, countLines } from '../lib/bingo'
import { BingoCard } from '../components/BingoCard'
import { PlayerList } from '../components/PlayerList'
import { CalledNumbers } from '../components/CalledNumbers'
import { playPing, playTick, playSuccess, getMuteState, setMuteState } from '../lib/audio'

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>()
  const navigate = useNavigate()
  const playerId = getOrCreatePlayerId()

  const [game, setGame]       = useState<Game | null>(null)
  const [players, setPlayers] = useState<GamePlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [calling, setCalling] = useState(false)
  const [error, setError]     = useState('')

  const [isMuted, setIsMuted] = useState(getMuteState())

  const gameRef    = useRef<Game | null>(null)
  const playersRef = useRef<GamePlayer[]>([])
  const winCheckRef = useRef(false)
  const markingRef  = useRef(false)
  const lastCalledLengthRef = useRef(0)

  gameRef.current    = game
  playersRef.current = players

  // Trigger sound when called numbers list changes
  useEffect(() => {
    if (game && game.called_numbers.length > lastCalledLengthRef.current) {
      playPing()
    }
    if (game) {
      lastCalledLengthRef.current = game.called_numbers.length
    }
  }, [game?.called_numbers])

  // ─── Load + subscribe ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomCode) return
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
      if (gameData.status === 'waiting')  { navigate(`/lobby/${roomCode}`); return }
      if (gameData.status === 'finished') { navigate(`/winner/${roomCode}`); return }

      setGame(gameData as Game)
      gameRef.current = gameData as Game

      const { data: pData } = await supabase
        .from('game_players')
        .select('*')
        .eq('game_id', gameData.id)
        .order('joined_at')

      if (cancelled) return
      setPlayers((pData as GamePlayer[]) ?? [])
      playersRef.current = (pData as GamePlayer[]) ?? []
      setLoading(false)

      gameChannel = supabase
        .channel(`game-main-${gameData.id}-${uid}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameData.id}` },
          (payload) => {
            const updated = payload.new as Game
            setGame(updated)
            gameRef.current = updated
            if (updated.status === 'finished') navigate(`/winner/${roomCode}`)
          }
        )
        .subscribe()

      playersChannel = supabase
        .channel(`game-players-${gameData.id}-${uid}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameData.id}` },
          async () => {
            const { data } = await supabase
              .from('game_players')
              .select('*')
              .eq('game_id', gameData.id)
              .order('joined_at')
            const updated = (data as GamePlayer[]) ?? []
            if (!cancelled) {
              setPlayers(updated)
              playersRef.current = updated
            }
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

  // ─── Win detection (host only) ─────────────────────────────────────────────
  useEffect(() => {
    const g = gameRef.current
    if (!g || g.status !== 'playing' || g.winner_id || winCheckRef.current) return
    if (g.host_id !== playerId) return

    const target = g.target_lines || 5
    const winner = playersRef.current.find((p) => p.lines_count >= target)
    if (!winner) return

    winCheckRef.current = true
    ;(async () => {
      await supabase.from('game_history').insert({
        game_id:        g.id,
        room_code:      g.room_code,
        winner_name:    winner.player_name,
        player_count:   playersRef.current.length,
        numbers_called: g.called_numbers,
        player_cards:   playersRef.current.map((p) => ({
          name:  p.player_name,
          card:  p.card,
          lines: p.lines_count,
        })),
      })
      await supabase
        .from('games')
        .update({ status: 'finished', winner_id: winner.player_id })
        .eq('id', g.id)
      winCheckRef.current = false
    })()
  }, [game, players, playerId])

  // ─── Auto Mode: Host calls next number ─────────────────────────────────────
  const handleCallNext = useCallback(async () => {
    const g = gameRef.current
    if (!g || calling) return
    setCalling(true)

    const called    = new Set(g.called_numbers)
    const remaining = Array.from({ length: 25 }, (_, i) => i + 1).filter((n) => !called.has(n))
    if (remaining.length === 0) { setCalling(false); return }

    // Engine picks randomly — host just triggers it
    const next      = remaining[Math.floor(Math.random() * remaining.length)]
    const newCalled = [...g.called_numbers, next]

    await supabase.from('games').update({ called_numbers: newCalled }).eq('id', g.id)
    setCalling(false)
  }, [calling])

  // ─── Manual Mode: Active player selects a number for their turn ───────────
  const handleSelectNumber = useCallback(async (num: number) => {
    const g = gameRef.current
    const me = playersRef.current.find((p) => p.player_id === playerId)
    if (!g || !me || calling) return

    const roomUpper = g.room_code ? g.room_code.toUpperCase() : ''
    const savedMode = sessionStorage.getItem(`bingo_mode_${roomUpper}`)
    const isManual = g.game_mode === 'manual' || savedMode === 'manual'

    const turnIndex = playersRef.current.length > 0 ? g.called_numbers.length % playersRef.current.length : 0
    const turnId = g.current_turn_player_id || playersRef.current[turnIndex]?.player_id || null

    if (!isManual || turnId !== playerId) return

    const calledSet = new Set(g.called_numbers)
    if (calledSet.has(num)) return

    setCalling(true)

    const newCalled = [...g.called_numbers, num]

    // Cycle turn to next player
    const currentIdx = playersRef.current.findIndex((p) => p.player_id === playerId)
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % playersRef.current.length : 0
    const nextTurnPlayerId = playersRef.current[nextIdx]?.player_id ?? playerId

    // Automatically mark the chosen number on caller's card
    const myMarked = new Set(me.marked_numbers ?? [])
    if (!myMarked.has(num)) {
      const newMarked = [...(me.marked_numbers ?? []), num]
      const newLines = countLines(me.card, newMarked)
      if (newLines > me.lines_count) {
        playSuccess()
      } else {
        playTick()
      }

      await supabase
        .from('game_players')
        .update({ marked_numbers: newMarked, lines_count: newLines })
        .eq('id', me.id)
    }

    // Update called numbers and advance turn
    const { error: err } = await supabase
      .from('games')
      .update({
        called_numbers: newCalled,
        current_turn_player_id: nextTurnPlayerId,
      })
      .eq('id', g.id)

    if (err) {
      // Fallback if current_turn_player_id column does not exist in DB yet
      await supabase
        .from('games')
        .update({ called_numbers: newCalled })
        .eq('id', g.id)
    }

    setCalling(false)
  }, [playerId, calling])

  // ─── Player marks a cell on their card ─────────────────────────────────────
  const handleMark = useCallback(async (num: number) => {
    if (markingRef.current) return
    const me = playersRef.current.find((p) => p.player_id === playerId)
    const g  = gameRef.current
    if (!me || !g) return

    const called  = new Set(g.called_numbers)
    const marked  = new Set(me.marked_numbers ?? [])
    if (!called.has(num) || marked.has(num)) return  // must be called & not already marked

    markingRef.current = true
    const newMarked = [...(me.marked_numbers ?? []), num]
    const newLines  = countLines(me.card, newMarked)

    if (newLines > me.lines_count) {
      playSuccess()
    } else {
      playTick()
    }

    await supabase
      .from('game_players')
      .update({ marked_numbers: newMarked, lines_count: newLines })
      .eq('id', me.id)

    markingRef.current = false
  }, [playerId])

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page">
        <div className="loading-spinner"><div className="spinner" /><span>Loading game...</span></div>
      </div>
    )
  }

  if (error || !game) {
    return (
      <div className="page">
        <div className="card card-padded text-center flex flex-col gap-16" style={{ maxWidth: 400 }}>
          <div className="error-msg">{error || 'Game not found.'}</div>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>Back to Home</button>
        </div>
      </div>
    )
  }

  const myPlayer     = players.find((p) => p.player_id === playerId)
  const isHost       = game.host_id === playerId
  const latestNumber = game.called_numbers[game.called_numbers.length - 1] ?? null
  const myLines      = myPlayer?.lines_count ?? 0
  const numbersLeft  = 25 - game.called_numbers.length

  const savedMode = roomCode ? sessionStorage.getItem(`bingo_mode_${roomCode.toUpperCase()}`) : null
  const isManualMode = game.game_mode === 'manual' || savedMode === 'manual'

  // Turn calculation fallback: if current_turn_player_id is not saved in DB, calculate from called_numbers length
  const turnIndex = players.length > 0 ? game.called_numbers.length % players.length : 0
  const currentTurnPlayerId = game.current_turn_player_id || players[turnIndex]?.player_id || null
  const isMyTurn = isManualMode ? currentTurnPlayerId === playerId : false
  const turnPlayer = players.find((p) => p.player_id === currentTurnPlayerId)

  // Find player who picked the latest number in manual mode
  const lastTurnIndex = game.called_numbers.length > 0
    ? (game.called_numbers.length - 1) % players.length
    : 0
  const lastPickerPlayer = players[lastTurnIndex]

  // Numbers that have been called but this player hasn't marked yet
  const unmarkCount = myPlayer
    ? game.called_numbers.filter((n) => !(myPlayer.marked_numbers ?? []).includes(n)).length
    : 0

  const hasUnmarkedLatest = latestNumber !== null && myPlayer && !(myPlayer.marked_numbers ?? []).includes(latestNumber)

  return (
    <div className="dashboard-view">
      {/* Nav */}
      <div className="nav-bar">
        <span className="nav-logo">BINGO</span>
        <div className="flex items-center gap-8" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const nextMute = !isMuted
              setMuteState(nextMute)
              setIsMuted(nextMute)
            }}
            title={isMuted ? 'Unmute sounds' : 'Mute sounds'}
            style={{ padding: '6px 10px', fontSize: '0.85rem' }}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
          <span className="badge badge-green"><span className="pulse-dot" />LIVE</span>
          {isManualMode && <span className="badge badge-yellow">🖐️ MANUAL</span>}
          <span className="badge badge-purple">Room: {game.room_code}</span>
        </div>
      </div>

      <div className="game-dashboard">
        {/* ── Left Column: Game Status, Caller, History ── */}
        <div className="dashboard-panel panel-left">
          {/* Turn Banner for Manual Mode */}
          {isManualMode && (
            <div className={`turn-card-box ${isMyTurn ? 'my-turn-bg' : 'opponent-turn-bg'}`}>
              <div className="turn-status-badge">
                {isMyTurn ? '👉 YOUR TURN' : `⏳ ${turnPlayer?.player_name ?? 'Opponent'}'s Turn`}
              </div>
              <div className="turn-status-desc">
                {isMyTurn
                  ? 'Pick 1 number on your grid to call it!'
                  : `Waiting for ${turnPlayer?.player_name ?? 'opponent'} to pick...`}
              </div>
            </div>
          )}

          {/* Current number */}
          <div className="current-number-display" style={{ margin: '8px 0' }}>
            <div className="current-number-label">
              {isManualMode ? 'Last Called Number' : 'Current Number'}
            </div>
            {latestNumber ? (
              <div className="current-number-value" key={latestNumber}>{latestNumber}</div>
            ) : (
              <div className="current-number-empty">—</div>
            )}
          </div>

          {/* Called numbers list */}
          <div className="flex-col flex-1 overflow-hidden" style={{ display: 'flex', minHeight: 0 }}>
            <div className="section-title">Called Numbers ({game.called_numbers.length} / 25)</div>
            <div className="dashboard-called-wrapper">
              <CalledNumbers numbers={game.called_numbers} />
            </div>
          </div>

          {/* Host / Player status actions */}
          <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            {!isManualMode ? (
              isHost ? (
                <div>
                  <button
                    id="btn-call-number"
                    className="btn btn-call btn-full"
                    onClick={handleCallNext}
                    disabled={calling || numbersLeft === 0}
                  >
                    {calling ? (
                      <>
                        <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: 'white' }} />
                        ...
                      </>
                    ) : numbersLeft === 0 ? (
                      'All Called'
                    ) : (
                      '🎱 Call Number'
                    )}
                  </button>
                  {numbersLeft > 0 && (
                    <div className="text-muted text-sm text-center" style={{ marginTop: 6 }}>
                      {numbersLeft} left
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center" style={{ padding: '8px 0' }}>
                  <div className="waiting-dots" style={{ marginBottom: 6 }}><span /><span /><span /></div>
                  <div className="text-muted text-sm">Waiting for host...</div>
                </div>
              )
            ) : (
              <div className="text-center" style={{ padding: '6px 0' }}>
                <div className="text-muted text-sm">
                  {isMyTurn ? '👇 Tap an uncalled number on your grid!' : '⏳ Opponent choosing...'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Center Column: Bingo Card ── */}
        <div className="dashboard-panel panel-center">
          {/* Opponent Called Number Notification Prompt (Manual Mode) */}
          {isManualMode && latestNumber && hasUnmarkedLatest && !isMyTurn && (
            <div className="check-number-banner">
              <div className="check-number-text">
                <span className="check-icon">🎯</span>
                <span>
                  <strong>{lastPickerPlayer?.player_name ?? 'Opponent'}</strong> chose number <strong>{latestNumber}</strong>! Check your card and mark it!
                </span>
              </div>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => handleMark(latestNumber)}
                style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                ✓ Mark {latestNumber}
              </button>
            </div>
          )}

          {/* Mark hint */}
          {unmarkCount > 0 ? (
            <div className="mark-hint">
              {unmarkCount} unmarked cell{unmarkCount > 1 ? 's' : ''} — tap to mark!
            </div>
          ) : isManualMode && isMyTurn ? (
            <div className="mark-hint my-turn-hint">
              ✨ YOUR TURN: Tap an uncalled number to choose it!
            </div>
          ) : (
            <div className="mark-hint" style={{ opacity: 0.3 }}>
              Select called numbers on your grid
            </div>
          )}

          {/* Bingo card */}
          {myPlayer ? (
            <BingoCard
              card={myPlayer.card}
              calledNumbers={game.called_numbers}
              markedNumbers={myPlayer.marked_numbers ?? []}
              latestNumber={latestNumber}
              gameMode={game.game_mode}
              isMyTurn={isMyTurn}
              onMark={handleMark}
              onSelectNumber={handleSelectNumber}
            />
          ) : (
            <div className="text-muted text-center text-sm" style={{ padding: 32 }}>
              Card is not available.
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-16" style={{ marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <div className="flex items-center gap-8 text-sm text-muted">
              <div style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.35)' }} />
              Called
            </div>
            <div className="flex items-center gap-8 text-sm text-muted">
              <div style={{ width: 12, height: 12, borderRadius: 3, background: '#ffffff', border: '1px solid #ffffff' }} />
              Marked
            </div>
            <div className="flex items-center gap-8 text-sm text-muted">
              <div style={{ width: 12, height: 12, borderRadius: 3, background: '#ffffff', border: '1px solid #ffffff', boxShadow: '0 0 8px rgba(255, 255, 255, 0.6)' }} />
              Line
            </div>
            {isManualMode && (
              <div className="flex items-center gap-8 text-sm text-muted">
                <div style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(255, 215, 0, 0.15)', border: '1px solid #ffd700' }} />
                Your Turn Choice
              </div>
            )}
          </div>
        </div>

        {/* ── Right Column: Player Progress & Standings ── */}
        <div className="dashboard-panel panel-right">
          {/* My Progress */}
          <div className="panel-sub-section" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
            <div className="section-title">My Progress</div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, margin: '8px 0' }}>
              <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>{myLines}</div>
              <div className="text-muted text-sm">/ {game.target_lines || 5} lines</div>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${(myLines / (game.target_lines || 5)) * 100}%` }} />
            </div>
          </div>

          {/* Players standings list */}
          <div className="panel-sub-section" style={{ flex: 1, overflowY: 'auto' }}>
            <div className="section-title" style={{ marginBottom: 8 }}>Players Progress</div>
            <PlayerList players={players} myPlayerId={playerId} hostId={game.host_id} targetLines={game.target_lines} />
          </div>
        </div>
      </div>
    </div>
  )
}
