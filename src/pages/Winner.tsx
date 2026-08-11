import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Confetti from 'react-confetti'
import { supabase, type Game, type GamePlayer } from '../lib/supabase'
import { getOrCreatePlayerId, generateCard, generateRoomCode } from '../lib/bingo'
import { BingoCard } from '../components/BingoCard'
import { playVictory } from '../lib/audio'

export default function Winner() {
  const { roomCode } = useParams<{ roomCode: string }>()
  const navigate = useNavigate()
  const playerId = getOrCreatePlayerId()

  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<GamePlayer[]>([])

  const [loading, setLoading] = useState(true)
  const [rematchLoading, setRematchLoading] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight })

  useEffect(() => {
    const onResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!roomCode) return
    const uid = Date.now()
    let gameChannel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    const load = async () => {
      const { data: gameData } = await supabase
        .from('games')
        .select('*')
        .eq('room_code', roomCode.toUpperCase())
        .single()

      if (cancelled) return
      if (!gameData) { setLoading(false); return }
      setGame(gameData as Game)

      // If next_room_code is already set, immediately navigate
      if (gameData.next_room_code) {
        navigate(`/lobby/${gameData.next_room_code}`)
        return
      }

      const { data: pData } = await supabase
        .from('game_players')
        .select('*')
        .eq('game_id', gameData.id)
        .order('joined_at')

      if (cancelled) return
      setPlayers((pData as GamePlayer[]) ?? [])
      setLoading(false)

      // Subscribe to changes in the current game to detect rematch redirection
      gameChannel = supabase
        .channel(`winner-game-${gameData.id}-${uid}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameData.id}` },
          (payload) => {
            const updated = payload.new as Game
            setGame(updated)
            if (updated.next_room_code) {
              navigate(`/lobby/${updated.next_room_code}`)
            }
          }
        )
        .subscribe()
    }

    load()
    return () => {
      cancelled = true
      if (gameChannel) supabase.removeChannel(gameChannel)
    }
  }, [roomCode, navigate])

  const isHost = game?.host_id === playerId
  const winner = players.find((p) => p.player_id === game?.winner_id)
  const isWinner = winner?.player_id === playerId
  const calledCount = game?.called_numbers.length ?? 0

  useEffect(() => {
    if (!loading && isWinner) {
      playVictory()
    }
  }, [loading, isWinner])

  const handlePlayAgain = async () => {
    if (!game) return
    setRematchLoading(true)

    const newRoomCode = generateRoomCode()
    const { data: newGame, error: gameErr } = await supabase
      .from('games')
      .insert({ room_code: newRoomCode, host_id: playerId })
      .select()
      .single()

    if (gameErr || !newGame) { setRematchLoading(false); return }

    for (const p of players) {
      await supabase.from('game_players').insert({
        game_id: newGame.id,
        player_id: p.player_id,
        player_name: p.player_name,
        card: generateCard(),
        lines_count: 0,
        marked_numbers: [],
      })
    }

    // Set next_room_code on old game row to trigger redirection for other players
    await supabase
      .from('games')
      .update({ next_room_code: newRoomCode })
      .eq('id', game.id)

    setRematchLoading(false)
    navigate(`/lobby/${newRoomCode}`)
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading-spinner">
          <div className="spinner" />
          <span>Loading results...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="winner-page">
      {/* Confetti for the winner */}
      {isWinner && (
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          numberOfPieces={300}
          recycle={false}
          colors={['#f5c842', '#ff8c42', '#a855f7', '#3b82f6', '#22c55e']}
        />
      )}

      <div style={{ width: '100%', maxWidth: 500 }} className="scale-in">
        {/* Trophy + title */}
        <div className="winner-emoji">
          {isWinner ? '🎉' : '🏆'}
        </div>
        <div className="winner-title">BINGO!</div>
        <div className="winner-name">
          {winner?.player_name ?? '?'} Wins!
          {isWinner && <span style={{ marginLeft: 8 }}>🎊</span>}
        </div>

        {/* Stats */}
        <div className="winner-stats">
          <div className="stat-chip">
            <div className="stat-value">{game?.target_lines} / {game?.target_lines}</div>
            <div className="stat-label">Lines</div>
          </div>
          <div className="stat-chip">
            <div className="stat-value">{calledCount}</div>
            <div className="stat-label">Numbers Called</div>
          </div>
          <div className="stat-chip">
            <div className="stat-value">{players.length}</div>
            <div className="stat-label">Players</div>
          </div>
        </div>

        {/* Winner's card */}
        {winner && (
          <div className="card card-padded" style={{ marginBottom: 24 }}>
            <div className="section-title" style={{ marginBottom: 12, textAlign: 'center' }}>
              {winner.player_name}'s Winning Card
            </div>
            <BingoCard
              card={winner.card}
              calledNumbers={game?.called_numbers ?? []}
              markedNumbers={winner.marked_numbers ?? []}
              latestNumber={null}
            />
          </div>
        )}

        {/* Player results */}
        <div className="card card-padded" style={{ marginBottom: 24 }}>
          <div className="section-title" style={{ marginBottom: 12 }}>Final Standings</div>
          {players
            .slice()
            .sort((a, b) => b.lines_count - a.lines_count)
            .map((p, idx) => (
              <div key={p.id} className="player-row">
                <div style={{ width: 24, textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`}
                </div>
                <span style={{ flex: 1, fontWeight: p.player_id === playerId ? 700 : 500, color: p.player_id === playerId ? 'var(--accent)' : 'var(--text-primary)' }}>
                  {p.player_name}
                </span>
                <span style={{ fontWeight: 700, color: p.player_id === game?.winner_id ? 'var(--neon-green)' : 'var(--text-secondary)' }}>
                  {p.lines_count} / {game?.target_lines}
                </span>
              </div>
            ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-12">
          {isHost && (
            <button
              id="btn-play-again"
              className="btn btn-primary btn-lg btn-full"
              onClick={handlePlayAgain}
              disabled={rematchLoading}
            >
              {rematchLoading ? (
                <>
                  <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                  Setting up...
                </>
              ) : (
                '🔄 Play Again'
              )}
            </button>
          )}

          {!isHost && (
            <div className="card card-padded text-center text-muted text-sm">
              <div className="waiting-dots" style={{ marginBottom: 8 }}><span /><span /><span /></div>
              Waiting for host to start a rematch...
            </div>
          )}

          <button
            id="btn-exit-game"
            className="btn btn-ghost btn-full"
            onClick={() => navigate('/')}
          >
            ← Exit to Home
          </button>
        </div>
      </div>
    </div>
  )
}
