import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOrCreatePlayerId, getPlayerName, setPlayerName, generateRoomCode, generateCard, generateAuthenticCard } from '../lib/bingo'
import { supabase } from '../lib/supabase'


export default function Home() {
  const navigate = useNavigate()
  const [name, setName] = useState(getPlayerName())
  const [joinCode, setJoinCode] = useState('')
  const [gridSize, setGridSize] = useState<5 | 6>(5)
  const [gameStyle, setGameStyle] = useState<'simple' | 'authentic'>('simple')
  const [loading, setLoading] = useState<'create' | 'join' | null>(null)
  const [error, setError] = useState('')

  const playerId = getOrCreatePlayerId()

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('Please enter your name first.'); return }
    setError('')
    setLoading('create')
    setPlayerName(trimmed)

    const roomCode = generateRoomCode()
    const card = gameStyle === 'authentic' ? generateAuthenticCard() : generateCard(gridSize)

    const { data: gameData, error: gameErr } = await supabase
      .from('games')
      .insert({ room_code: roomCode, host_id: playerId, grid_size: gameStyle === 'authentic' ? 5 : gridSize, game_style: gameStyle })
      .select()
      .single()

    if (gameErr || !gameData) {
      console.error(gameErr)
      setError(`Failed to create game: ${gameErr?.message || 'Unknown error'}. Try again.`)
      setLoading(null)
      return
    }

    await supabase.from('game_players').insert({
      game_id: gameData.id,
      player_id: playerId,
      player_name: trimmed,
      card,
    })

    setLoading(null)
    navigate(`/lobby/${roomCode}`)
  }

  const handleJoin = async () => {
    const trimmed = name.trim()
    const code = joinCode.trim().toUpperCase()
    if (!trimmed) { setError('Please enter your name first.'); return }
    if (code.length !== 5) { setError('Room code must be 5 characters.'); return }
    setError('')
    setLoading('join')
    setPlayerName(trimmed)

    const { data: gameData, error: gameErr } = await supabase
      .from('games')
      .select('*')
      .eq('room_code', code)
      .single()

    if (gameErr || !gameData) {
      setError('Room not found. Check the code and try again.')
      setLoading(null)
      return
    }

    if (gameData.status !== 'waiting') {
      setError('This game has already started.')
      setLoading(null)
      return
    }

    const { count } = await supabase
      .from('game_players')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameData.id)

    if ((count ?? 0) >= 5) {
      setError('This room is full (max 5 players).')
      setLoading(null)
      return
    }

    // Check if already joined
    const { data: existing } = await supabase
      .from('game_players')
      .select('id')
      .eq('game_id', gameData.id)
      .eq('player_id', playerId)
      .single()

    if (!existing) {
      const card = gameData.game_style === 'authentic' ? generateAuthenticCard() : generateCard(gameData.grid_size || 5)
      await supabase.from('game_players').insert({
        game_id: gameData.id,
        player_id: playerId,
        player_name: trimmed,
        card,
      })
    }

    setLoading(null)
    navigate(`/lobby/${code}`)
  }

  return (
    <div className="page">
      <div style={{ width: '100%', maxWidth: 420 }} className="fade-in">
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div className="logo" style={{ fontSize: '2.5rem', letterSpacing: '0.2em' }}>BINGO</div>
          <div className="logo-sub" style={{ fontSize: '0.75rem', marginTop: 4 }}>Play with friends · Up to 5 players</div>
        </div>

        {/* Card */}
        <div className="card flex flex-col gap-16" style={{ padding: '24px 28px' }}>
          {/* Name input */}
          <div>
            <label className="input-label" htmlFor="player-name">Your Name</label>
            <input
              id="player-name"
              className="input"
              type="text"
              placeholder="Enter your name..."
              value={name}
              maxLength={20}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              style={{ padding: '12px 14px' }}
            />
          </div>

          {/* Grid Size */}
          <div>
            <label className="input-label" htmlFor="grid-size">Grid Size</label>
            <div className="flex gap-8">
              <button
                type="button"
                className={`btn btn-sm flex-1 ${gridSize === 5 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setGridSize(5)}
                style={{ padding: '10px 12px', fontSize: '0.85rem' }}
              >
                5x5
              </button>
              <button
                type="button"
                className={`btn btn-sm flex-1 ${gridSize === 6 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setGridSize(6); setGameStyle('simple'); }}
                style={{ padding: '10px 12px', fontSize: '0.85rem' }}
              >
                6x6
              </button>
            </div>
          </div>

          {/* Game Style */}
          <div>
            <label className="input-label" htmlFor="game-style">Game Style</label>
            <div className="flex gap-8">
              <button
                type="button"
                className={`btn btn-sm flex-1 ${gameStyle === 'simple' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setGameStyle('simple')}
                style={{ padding: '10px 12px', fontSize: '0.85rem' }}
              >
                Simple
              </button>
              <button
                type="button"
                className={`btn btn-sm flex-1 ${gameStyle === 'authentic' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setGameStyle('authentic'); setGridSize(5); }}
                style={{ padding: '10px 12px', fontSize: '0.85rem' }}
              >
                Authentic 75-Ball
              </button>
            </div>
          </div>

          {/* Create */}
          <button
            id="btn-create-game"
            className="btn btn-primary btn-full"
            onClick={handleCreate}
            disabled={!!loading}
            style={{ padding: '12px 24px', fontSize: '0.95rem' }}
          >
            {loading === 'create' ? (
              <>
                <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                Creating...
              </>
            ) : (
              '✦ Create Game'
            )}
          </button>

          <div className="divider" style={{ fontSize: '0.75rem' }}>or join</div>

          {/* Join */}
          <div className="flex flex-col gap-12">
            <input
              id="join-code-input"
              className="input input-code"
              type="text"
              placeholder="X7K29"
              value={joinCode}
              maxLength={5}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              style={{ padding: '10px 16px', fontSize: '1.6rem' }}
            />
            <button
              id="btn-join-game"
              className="btn btn-secondary btn-full"
              onClick={handleJoin}
              disabled={!!loading}
              style={{ padding: '12px 24px', fontSize: '0.95rem' }}
            >
              {loading === 'join' ? (
                <>
                  <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Joining...
                </>
              ) : (
                'Join with Code'
              )}
            </button>
          </div>

          {error && <div className="error-msg" style={{ padding: '8px 12px', fontSize: '0.8rem' }}>{error}</div>}
        </div>

        {/* History + Leaderboard links */}
        <div className="flex items-center justify-center gap-12" style={{ marginTop: 16 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/leaderboard')}
          >
            🏆 Leaderboard
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/history')}
          >
            📋 Game History
          </button>
        </div>
      </div>
    </div>
  )
}
