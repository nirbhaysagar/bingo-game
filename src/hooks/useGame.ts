import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, type Game, type GamePlayer } from '../lib/supabase'
import {
  generateCard,
  generateRoomCode,
  countLines,
  checkWin,
  getOrCreatePlayerId,
  getPlayerName,
} from '../lib/bingo'

interface GameState {
  game: Game | null
  players: GamePlayer[]
  myPlayer: GamePlayer | null
  isHost: boolean
  loading: boolean
  error: string | null
}

interface GameActions {
  createGame: () => Promise<string | null>
  joinGame: (roomCode: string) => Promise<boolean>
  startGame: () => Promise<void>
  callNextNumber: () => Promise<void>
  playAgain: () => Promise<string | null>
}

export function useGame(roomCode?: string): GameState & GameActions {
  const navigate = useNavigate()
  const playerId = getOrCreatePlayerId()
  const playerName = getPlayerName()

  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<GamePlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const gameRef = useRef<Game | null>(null)
  const playersRef = useRef<GamePlayer[]>([])
  const winCheckInProgress = useRef(false)

  gameRef.current = game
  playersRef.current = players

  const myPlayer = players.find((p) => p.player_id === playerId) ?? null
  const isHost = game?.host_id === playerId

  // ─── Load initial data ──────────────────────────────────────────────────
  useEffect(() => {
    if (!roomCode) {
      setLoading(false)
      return
    }

    let gameChannel: ReturnType<typeof supabase.channel> | null = null
    let playersChannel: ReturnType<typeof supabase.channel> | null = null

    const load = async () => {
      setLoading(true)
      setError(null)

      // Fetch game
      const { data: gameData, error: gameErr } = await supabase
        .from('games')
        .select('*')
        .eq('room_code', roomCode.toUpperCase())
        .single()

      if (gameErr || !gameData) {
        setError('Room not found.')
        setLoading(false)
        return
      }

      setGame(gameData as Game)
      gameRef.current = gameData as Game

      // Fetch players
      const { data: playerData } = await supabase
        .from('game_players')
        .select('*')
        .eq('game_id', gameData.id)
        .order('joined_at')

      setPlayers((playerData as GamePlayer[]) ?? [])
      playersRef.current = (playerData as GamePlayer[]) ?? []
      setLoading(false)

      // ─── Subscribe to game changes ──────────────────────────────────────
      gameChannel = supabase
        .channel(`game-${gameData.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameData.id}` },
          (payload) => {
            const updated = payload.new as Game
            setGame(updated)
            gameRef.current = updated

            // Navigate on status changes
            if (updated.status === 'playing' && window.location.pathname.includes('/lobby')) {
              navigate(`/game/${updated.room_code}`)
            }
            if (updated.status === 'finished' && !window.location.pathname.includes('/winner')) {
              navigate(`/winner/${updated.room_code}`)
            }
          }
        )
        .subscribe()

      // ─── Subscribe to player changes ────────────────────────────────────
      playersChannel = supabase
        .channel(`players-${gameData.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameData.id}` },
          async () => {
            // Re-fetch all players on any change
            const { data } = await supabase
              .from('game_players')
              .select('*')
              .eq('game_id', gameData.id)
              .order('joined_at')
            setPlayers((data as GamePlayer[]) ?? [])
            playersRef.current = (data as GamePlayer[]) ?? []
          }
        )
        .subscribe()
    }

    load()

    return () => {
      gameChannel?.unsubscribe()
      playersChannel?.unsubscribe()
    }
  }, [roomCode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Win check after game/players update ────────────────────────────────────
  useEffect(() => {
    const g = gameRef.current
    if (!g || g.status !== 'playing' || g.winner_id || winCheckInProgress.current) return

    // Only host performs the win-check write
    if (g.host_id !== playerId) return

    const winner = playersRef.current.find((p) => checkWin(p.lines_count, g.target_lines))
    if (!winner) return

    winCheckInProgress.current = true

    const finishGame = async () => {
      // Save to game_history
      await supabase.from('game_history').insert({
        game_id: g.id,
        room_code: g.room_code,
        winner_name: winner.player_name,
        player_count: playersRef.current.length,
        numbers_called: g.called_numbers,
        player_cards: playersRef.current.map((p) => ({
          name: p.player_name,
          card: p.card,
          lines: p.lines_count,
        })),
      })

      // Mark game finished
      await supabase
        .from('games')
        .update({ status: 'finished', winner_id: winner.player_id })
        .eq('id', g.id)

      winCheckInProgress.current = false
    }

    finishGame()
  }, [game, players]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Actions ─────────────────────────────────────────────────────────────

  const createGame = useCallback(async (): Promise<string | null> => {
    setError(null)
    const roomCode = generateRoomCode()
    const card = generateCard(5) // Default if used from here

    const { data: gameData, error: gameErr } = await supabase
      .from('games')
      .insert({ room_code: roomCode, host_id: playerId })
      .select()
      .single()

    if (gameErr || !gameData) {
      setError('Failed to create game. Try again.')
      return null
    }

    await supabase.from('game_players').insert({
      game_id: gameData.id,
      player_id: playerId,
      player_name: playerName,
      card,
    })

    return roomCode
  }, [playerId, playerName])

  const joinGame = useCallback(
    async (code: string): Promise<boolean> => {
      setError(null)
      const upper = code.toUpperCase()

      const { data: gameData, error: gameErr } = await supabase
        .from('games')
        .select('*')
        .eq('room_code', upper)
        .single()

      if (gameErr || !gameData) {
        setError('Room not found. Check the code and try again.')
        return false
      }

      if (gameData.status !== 'waiting') {
        setError('This game has already started.')
        return false
      }

      // Check player count
      const { count } = await supabase
        .from('game_players')
        .select('*', { count: 'exact', head: true })
        .eq('game_id', gameData.id)

      if ((count ?? 0) >= 5) {
        setError('This room is full (max 5 players).')
        return false
      }

      // Check if already in game
      const { data: existing } = await supabase
        .from('game_players')
        .select('id')
        .eq('game_id', gameData.id)
        .eq('player_id', playerId)
        .single()

      if (!existing) {
        const card = generateCard(gameData.grid_size || 5)
        await supabase.from('game_players').insert({
          game_id: gameData.id,
          player_id: playerId,
          player_name: playerName,
          card,
        })
      }

      return true
    },
    [playerId, playerName]
  )

  const startGame = useCallback(async () => {
    if (!game) return
    await supabase.from('games').update({ status: 'playing' }).eq('id', game.id)
  }, [game])

  const callNextNumber = useCallback(async () => {
    const g = gameRef.current
    if (!g || g.status !== 'playing') return

    const called = new Set(g.called_numbers)
    const totalNumbers = g.grid_size ? g.grid_size * g.grid_size : 25
    const remaining = Array.from({ length: totalNumbers }, (_, i) => i + 1).filter((n) => !called.has(n))

    if (remaining.length === 0) return

    const next = remaining[Math.floor(Math.random() * remaining.length)]
    const newCalled = [...g.called_numbers, next]

    // Update called numbers in game
    await supabase.from('games').update({ called_numbers: newCalled }).eq('id', g.id)

    // Update lines_count for all players
    const currentPlayers = playersRef.current
    for (const p of currentPlayers) {
      const lines = countLines(p.card, newCalled, g.grid_size || 5)
      if (lines !== p.lines_count) {
        await supabase
          .from('game_players')
          .update({ lines_count: lines })
          .eq('id', p.id)
      }
    }
  }, [])

  const playAgain = useCallback(async (): Promise<string | null> => {
    const g = gameRef.current
    if (!g) return null

    const newRoomCode = generateRoomCode()

    // Create new game preserving settings
    const { data: newGame, error: gameErr } = await supabase
      .from('games')
      .insert({
        room_code: newRoomCode,
        host_id: playerId,
        target_lines: g.target_lines ?? 5,
        game_mode: g.game_mode ?? 'auto',
        grid_size: g.grid_size ?? 5,
      })
      .select()
      .single()

    if (gameErr || !newGame) return null

    // Re-add all previous players with new cards
    for (const p of playersRef.current) {
      await supabase.from('game_players').insert({
        game_id: newGame.id,
        player_id: p.player_id,
        player_name: p.player_name,
        card: generateCard(newGame.grid_size || 5),
        lines_count: 0,
      })
    }

    return newRoomCode
  }, [playerId])

  return {
    game,
    players,
    myPlayer,
    isHost,
    loading,
    error,
    createGame,
    joinGame,
    startGame,
    callNextNumber,
    playAgain,
  }
}
