'use client';

import { useState, useEffect } from 'react';
import Pusher from 'pusher-js';

type Role =
  | 'mayor'
  | 'citizen'
  | 'mafia'
  | 'detective'
  | 'doctor'
  | 'angel';

interface Player {
  id: string;
  name: string;
  role?: Role;
  alive: boolean;
  usedAbility?: boolean;
}

interface GameState {
  players: Player[];
  gameStarted: boolean;
  gamePhase: 'lobby' | 'night' | 'day' | 'voting' | 'end';
  votes: Record<string, string>;
  roomCode?: string;
  maxPlayers?: number;
  mafiaIds?: string[];
  mayorId?: string;
  lastNightVictimId?: string;
  lastLynchedId?: string;
  winner?: 'citizens' | 'mafia';
    nightActions?: Array<{
      type: 'mafia' | 'doctor' | 'angel' | string;
      actorId: string;
      actorName: string;
      targetId: string;
      targetName: string;
    }>;
}

type View = 'menu' | 'create' | 'join' | 'lobby' | 'night' | 'day' | 'voting' | 'end';

export default function Home() {
  const [pusher, setPusher] = useState<Pusher | null>(null);
  const [channel, setChannel] = useState<any>(null);
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [view, setView] = useState<View>('menu');
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    gameStarted: false,
    gamePhase: 'lobby',
    votes: {},
    maxPlayers: 6,
  });
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [roleDescription, setRoleDescription] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState<number>(5);
  const [mayorMessages, setMayorMessages] = useState<string[]>([]);
  const [killedMessage, setKilledMessage] = useState<string | null>(null);

  // Initialize Pusher
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_PUSHER_KEY) {
      const pusherInstance = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'eu',
        authEndpoint: '/api/pusher/auth',
        auth: {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      });
      setPusher(pusherInstance);
      return () => {
        pusherInstance.disconnect();
      };
    }
  }, []);

  // Subscribe to room channel when roomCode changes
  useEffect(() => {
    if (pusher && roomCode) {
      const roomChannel = pusher.subscribe(`room-${roomCode}`);
      const privateChannel = playerId ? pusher.subscribe(`private-player-${playerId}`) : null;

      // Čekej na připojení channelu a načti aktuální stav
      roomChannel.bind('pusher:subscription_succeeded', async () => {
        console.log('✅ Subscribed to room channel:', roomCode);
        // Načti aktuální stav místnosti
        try {
          const response = await fetch(`/api/rooms/state?roomCode=${roomCode}`);
          if (response.ok) {
            const state = await response.json();
            setGameState(state);
            if (state.gamePhase === 'lobby') {
              setView('lobby');
            }
          }
        } catch (err) {
          console.error('Error fetching room state:', err);
        }
      });

      roomChannel.bind('gameState', (state: GameState) => {
        console.log('📦 Received gameState:', state);
        setGameState(state);
        if (state.roomCode) {
          setRoomCode(state.roomCode);
        }
        
        // Změna fáze hry
        if (state.gamePhase === 'lobby') {
          setView('lobby');
          setVotedFor(null);
        } else if (state.gamePhase === 'night') {
          setView('night');
        } else if (state.gamePhase === 'day') {
          setView('day');
        } else if (state.gamePhase === 'voting') {
          setView('voting');
        } else if (state.gamePhase === 'end') {
          setView('end');
        }
      });

      if (privateChannel) {
        privateChannel.bind('pusher:subscription_succeeded', () => {
          console.log('✅ Subscribed to private channel:', playerId);
        });

        privateChannel.bind('roleAssigned', (data: { role: Role }) => {
          const descriptions: Record<Role, string> = {
            mayor: 'Jsi Starosta. Moderuješ hru, řídíš noc i den a sám nehlasuješ.',
            mafia: 'Jsi Vrah (mafia). Vaším cílem je nenápadně zabíjet Občany tak, aby vás městečko neodhalilo.',
            detective: 'Jsi Detektiv (Katány). Nenápadně pomáhej Občanům odhalit vrahy.',
            doctor: 'Jsi Doktor. Jednou za hru můžeš po vraždě zachránit oběť (Starosta se s tebou domluví během noci).',
            angel: 'Jsi Anděl. Jednou za hru můžeš kdykoliv oživit libovolného hráče kromě sebe (domluvíš se se Starostou).',
            citizen: 'Jsi obyčejný Občan. Diskutuj, ptej se a snaž se odhalit vrahy při hlasování.',
          };
          setRoleDescription(descriptions[data.role]);
        });

        // Notifikace o nočních akcích (dostane pouze cílový privátní kanál hráče)
        privateChannel.bind('actionOccurred', (data: { message: string }) => {
          setMayorMessages((prev) => [...prev, data.message]);
        });

        // Notifikace pro oběť: zobrazení plnoobrazovkové hlášky a zablokování akcí
        privateChannel.bind('youWereKilled', (data: { message: string }) => {
          setKilledMessage(data.message);
        });
      }

      setChannel(roomChannel);

      return () => {
        roomChannel.unbind_all();
        roomChannel.unsubscribe();
        if (privateChannel) {
          privateChannel.unbind_all();
          privateChannel.unsubscribe();
        }
      };
    }
  }, [pusher, roomCode, playerId]);

  const createRoom = async () => {
    if (playerName.trim() && maxPlayers) {
      setError('');
      try {
        const response = await fetch('/api/rooms/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: playerName.trim(), maxPlayers }),
        });
        const data = await response.json();
        if (response.ok) {
          setRoomCode(data.roomCode);
          setPlayerId(data.playerId);
          setView('lobby');
        } else {
          setError(data.error || 'Chyba při vytváření místnosti');
        }
      } catch (err) {
        setError('Chyba při vytváření místnosti');
      }
    }
  };

  const joinRoom = async () => {
    if (playerName.trim() && inputRoomCode.trim()) {
      setError('');
      try {
        const response = await fetch('/api/rooms/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode: inputRoomCode.trim().toUpperCase(), name: playerName.trim() }),
        });
        const data = await response.json();
        if (response.ok) {
          setRoomCode(inputRoomCode.trim().toUpperCase());
          setPlayerId(data.playerId);
          setView('lobby');
        } else {
          setError(data.error || 'Chyba při připojování');
        }
      } catch (err) {
        setError('Chyba při připojování');
      }
    }
  };

  const startGame = async () => {
    if (roomCode && playerId) {
      setError('');
      try {
        const response = await fetch('/api/game/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomCode,
            playerId,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          setError(data.error || 'Chyba při spuštění hry');
        }
      } catch (err) {
        setError('Chyba při spuštění hry');
      }
    }
  };

  const vote = async (votedForId: string) => {
    if (roomCode && playerId) {
      try {
        // Nastavit votedFor PŘED voláním API
        setVotedFor(votedForId);
        
        const response = await fetch('/api/game/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode, playerId, votedForId }),
        });
        
        if (!response.ok) {
          // Pokud selže, resetuj votedFor
          setVotedFor(null);
          setError('Chyba při hlasování');
        }
      } catch (err) {
        // Pokud selže, resetuj votedFor
        setVotedFor(null);
        setError('Chyba při hlasování');
      }
    }
  };

  const startVoting = async () => {
    if (roomCode && playerId) {
      try {
        await fetch('/api/game/start-voting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode, playerId }),
        });
      } catch (err) {
        setError('Chyba při spuštění hlasování');
      }
    }
  };

  const mafiaAction = async (targetId: string) => {
    if (roomCode && playerId) {
      try {
        await fetch('/api/game/night-mafia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode, playerId, targetId }),
        });
      } catch (err) {
        setError('Chyba při volbě oběti pro mafii');
      }
    }
  };

  const doctorAction = async (targetId: string) => {
    if (roomCode && playerId) {
      try {
        await fetch('/api/game/night-doctor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode, playerId, targetId }),
        });
      } catch (err) {
        setError('Chyba při použití doktora');
      }
    }
  };

  const angelAction = async (targetId: string) => {
    if (roomCode && playerId) {
      try {
        await fetch('/api/game/night-angel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode, playerId, targetId }),
        });
      } catch (err) {
        setError('Chyba při použití anděla');
      }
    }
  };

  const resolveNight = async () => {
    if (roomCode && playerId) {
      try {
        await fetch('/api/game/resolve-night', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode, playerId }),
        });
      } catch (err) {
        setError('Chyba při ukončování noci');
      }
    }
  };

  const nextRound = async () => {
    if (roomCode && playerId) {
      try {
        await fetch('/api/game/next-round', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode, playerId }),
        });
        setVotedFor(null);
        setRoleDescription('');
      } catch (err) {
        setError('Chyba při spuštění nové hry');
      }
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentPlayer = gameState.players.find(p => p.id === playerId);
  const isMayor = gameState.mayorId === playerId;
  const isHost = gameState.players.length > 0 && gameState.players[0].id === playerId;

  return (
    <main className="min-h-screen bg-[#0f0f10] text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-[#0f0f10]/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center font-bold text-base sm:text-lg">
              🎭
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold">Městečko Palermo</h1>
              <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-semibold">BETA</span>
            </div>
          </div>
          {roomCode && (
            <div className="flex items-center gap-1 sm:gap-2">
              <span className="text-xs sm:text-sm text-zinc-400 hidden sm:inline">Místnost:</span>
              <code className="px-2 sm:px-3 py-1 sm:py-1.5 bg-zinc-800 rounded-lg font-mono text-xs sm:text-sm font-bold tracking-wider">
                {roomCode}
              </code>
              <button
                onClick={copyRoomCode}
                className="p-1.5 sm:p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                {copied ? (
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

        {/* Pokud byl hráč zavražděn, ukaž plnoobrazovkovou hlášku a zablokuj UI */}
        {killedMessage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 text-center p-6">
            <div className="max-w-xl w-full bg-zinc-900 border border-red-600 rounded-lg p-8">
              <h2 className="text-2xl font-bold text-red-400 mb-3">Byl jsi zavražděn</h2>
              <p className="text-zinc-300 mb-4">{killedMessage}</p>
              <p className="text-zinc-500 text-sm">Jsi nyní vyřazen ze hry a nemůžeš nic dělat. Sleduj průběh.</p>
            </div>
          </div>
        )}

        {isMayor && mayorMessages && mayorMessages.length > 0 && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2">
            <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-100">
              {mayorMessages.map((m, i) => (
                <div key={i} className="py-1">{m}</div>
              ))}
            </div>
          </div>
        )}

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {error && (
          <div className="mb-4 sm:mb-6 bg-red-500/10 border border-red-500/20 text-red-400 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm flex items-center gap-2">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
          </div>
        )}

        {view === 'menu' && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <div className="flex items-center justify-center gap-3 mb-4">
                <span className="px-3 py-1 text-xs rounded-full bg-green-500/10 text-green-300 border border-green-500/30">
                  Městečko Palermo – sociální dedukční hra
                </span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-2 sm:mb-3">Městečko Palermo</h2>
              <p className="text-sm sm:text-base text-zinc-400">
                Všichni jsou Občané, ale někteří jsou tajní Vrazi. Hra ti vždy řekne, co máš právě dělat.
              </p>
            </div>
            
            <div className="grid gap-3 sm:gap-4">
              <button
                onClick={() => setView('create')}
                className="group bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl p-6 sm:p-8 transition-all text-left"
              >
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-purple-500/10 flex items-center justify-center mb-3 sm:mb-4 group-hover:bg-purple-500/20 transition-colors">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h3 className="text-lg sm:text-xl font-semibold mb-1 sm:mb-2">Vytvořit místnost</h3>
                <p className="text-xs sm:text-sm text-zinc-400">Založte novou hru a pozvěte přátele</p>
              </button>

              <button
                onClick={() => setView('join')}
                className="group bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl p-6 sm:p-8 transition-all text-left"
              >
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-3 sm:mb-4 group-hover:bg-blue-500/20 transition-colors">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                </div>
                <h3 className="text-lg sm:text-xl font-semibold mb-1 sm:mb-2">Připojit se</h3>
                <p className="text-xs sm:text-sm text-zinc-400">Vstupte do existující místnosti</p>
              </button>
            </div>
          </div>
        )}

        {view === 'create' && (
          <div className="max-w-xl mx-auto">
            <button
              onClick={() => setView('menu')}
              className="mb-4 sm:mb-6 text-xs sm:text-sm text-zinc-400 hover:text-white flex items-center gap-2 transition-colors"
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Zpět
            </button>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Vytvořit místnost</h2>
              
              <div className="space-y-4 sm:space-y-6">
                <div>
                  <label className="block text-xs sm:text-sm font-medium mb-2 text-zinc-300">Vaše jméno</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Zadejte své jméno"
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    onKeyPress={(e) => e.key === 'Enter' && createRoom()}
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium mb-2 sm:mb-3 text-zinc-300">Počet hráčů</label>
                  <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
                    {[6, 7, 8, 9, 10, 11].map((num) => (
                      <button
                        key={num}
                        onClick={() => setMaxPlayers(num)}
                        className={`py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg font-semibold text-sm sm:text-base transition-all ${
                          maxPlayers === num
                            ? 'bg-purple-500 text-white'
                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] sm:text-xs text-zinc-500">
                    Doporučeno 8–11 hráčů. První hráč v seznamu bude Starosta (moderátor hry).
                  </p>
                </div>

                <button
                  onClick={createRoom}
                  disabled={!playerName.trim()}
                  className="w-full bg-purple-500 hover:bg-purple-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold py-2.5 sm:py-3 text-sm sm:text-base rounded-lg transition-all disabled:cursor-not-allowed"
                >
                  Vytvořit místnost
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'join' && (
          <div className="max-w-xl mx-auto">
            <button
              onClick={() => setView('menu')}
              className="mb-4 sm:mb-6 text-xs sm:text-sm text-zinc-400 hover:text-white flex items-center gap-2 transition-colors"
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Zpět
            </button>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Připojit se</h2>
              
              <div className="space-y-4 sm:space-y-6">
                <div>
                  <label className="block text-xs sm:text-sm font-medium mb-2 text-zinc-300">Vaše jméno</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Zadejte své jméno"
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium mb-2 text-zinc-300">Kód místnosti</label>
                  <input
                    type="text"
                    value={inputRoomCode}
                    onChange={(e) => setInputRoomCode(e.target.value.toUpperCase())}
                    placeholder="ABCD"
                    maxLength={4}
                    className="w-full px-3 sm:px-4 py-3 sm:py-4 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-center text-xl sm:text-2xl font-mono font-bold tracking-[0.3em] sm:tracking-[0.5em] uppercase"
                    onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
                  />
                </div>

                <button
                  onClick={joinRoom}
                  disabled={!playerName.trim() || !inputRoomCode.trim()}
                  className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold py-2.5 sm:py-3 text-sm sm:text-base rounded-lg transition-all disabled:cursor-not-allowed"
                >
                  Připojit se
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'lobby' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-8">
              <div className="flex items-center justify-between mb-6 sm:mb-8">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold mb-0.5 sm:mb-1">Čekárna městečka 🕒</h2>
                  <p className="text-xs sm:text-sm text-zinc-400">
                    Pro Městečko Palermo je ideální 6+ hráčů. Až budou všichni, host spustí hru jako Starosta.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl sm:text-3xl font-bold">{gameState.players.length}/{gameState.maxPlayers || 6}</div>
                  <div className="text-xs sm:text-sm text-zinc-400">Hráči</div>
                </div>
              </div>

              <div className="grid gap-2 sm:gap-3 mb-6 sm:mb-8">
                {Array.from({ length: gameState.maxPlayers || 6 }).map((_, index) => {
                  const player = gameState.players[index];
                  return (
                    <div
                      key={index}
                      className={`p-3 sm:p-4 rounded-lg border transition-all ${
                        player
                          ? player.id === playerId
                            ? 'bg-purple-500/10 border-purple-500/30'
                            : 'bg-zinc-800 border-zinc-700'
                          : 'bg-zinc-900 border-zinc-800 border-dashed'
                      }`}
                    >
                      {player ? (
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center font-bold text-sm sm:text-base flex-shrink-0">
                            {player.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm sm:text-base flex items-center gap-1.5 sm:gap-2 flex-wrap">
                              <span className="truncate">{player.name}</span>
                              {player.id === playerId && (
                                <span className="text-[10px] sm:text-xs bg-purple-500/20 text-purple-400 px-1.5 sm:px-2 py-0.5 rounded flex-shrink-0">Ty</span>
                              )}
                              {index === 0 && (
                                <span className="text-[10px] sm:text-xs bg-yellow-500/20 text-yellow-400 px-1.5 sm:px-2 py-0.5 rounded flex-shrink-0">Host 👑</span>
                              )}
                            </div>
                            <div className="text-[10px] sm:text-xs text-zinc-500">
                              {index === 0 ? 'Starosta (host) – nebude hlasovat' : 'Připraven ✅'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 sm:gap-3 text-zinc-600">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg border-2 border-dashed border-zinc-700 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <span className="text-xs sm:text-sm">Čeká se na hráče...</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {isHost && (
                <div className="space-y-3 sm:space-y-4 pt-4 sm:pt-6 border-t border-zinc-800">
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 sm:p-4 text-xs sm:text-sm text-zinc-300 space-y-1.5">
                    <p className="font-semibold text-zinc-100">Jak to bude probíhat:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Host je Starosta – řídí noc a den, sám nehlasuje.</li>
                      <li>Hra rozdá role (Vrazi, Detektiv, Doktor, Anděl, Občané) tajně každému hráči.</li>
                      <li>Ve hře vždy uvidíš, v jaké jste fázi a co přesně máš dělat.</li>
                    </ul>
                  </div>

                  <button
                    onClick={startGame}
                    disabled={gameState.players.length !== (gameState.maxPlayers || 6)}
                    className="w-full bg-green-500 hover:bg-green-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold py-2.5 sm:py-3 text-sm sm:text-base rounded-lg transition-all disabled:cursor-not-allowed"
                  >
                    {gameState.players.length === (gameState.maxPlayers || 6) 
                      ? '🎮 Rozdat role a začít noc'
                      : `⏳ Čeká se na hráče (${gameState.players.length}/${gameState.maxPlayers || 6})`
                    }
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

{view === 'night' && (
          <div className="max-w-3xl mx-auto">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 sm:p-8 space-y-6">
              <div className="text-center">
                <h2 className="text-xl sm:text-2xl font-bold mb-2 sm:mb-3">Noc padá na městečko 🌙</h2>
                <p className="text-sm sm:text-base text-zinc-400">
                  {isMayor 
                    ? 'Sleduj noční akce jednotlivých hráčů. Jakmile všichni provedou své akce, ukonči noc.'
                    : 'Každý si potichu přečte svou roli. Tajné akce (vražda, léčení, oživení) zadejte přímo v této obrazovce.'
                  }
                </p>
              </div>

              {currentPlayer && (
                <div className="grid gap-4 sm:gap-6">
                  {!isMayor && (
                    <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-4 sm:p-6 text-left space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center font-bold text-lg">
                          {currentPlayer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-zinc-500">Tvoje role</p>
                          <p className="text-lg font-semibold text-white">
                            {currentPlayer.role === 'mayor' && 'Starosta'}
                            {currentPlayer.role === 'mafia' && 'Vrah (mafia)'}
                            {currentPlayer.role === 'detective' && 'Detektiv (Katány)'}
                            {currentPlayer.role === 'doctor' && 'Doktor'}
                            {currentPlayer.role === 'angel' && 'Anděl'}
                            {currentPlayer.role === 'citizen' && 'Občan'}
                          </p>
                        </div>
                      </div>

                      <div className="text-sm sm:text-base text-zinc-300 leading-relaxed">
                        {roleDescription || 'Počkej, až Starosta ukončí noc. Pokud má tvoje role tlačítko níže, použij ho podle pravidel.'}
                      </div>
                    </div>
                  )}

                  {/* Starosta vidí všechny noční akce */}
                  {isMayor && (
                    <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-lg p-4 sm:p-6 space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">👑</span>
                        <h3 className="text-lg font-bold text-yellow-200">Noční aktivita</h3>
                      </div>
                      
                      <div className="space-y-3">
                        {gameState.nightActions && gameState.nightActions.length > 0 ? (
                          gameState.nightActions.map((action: any, idx: number) => (
                            <div key={idx} className={`p-3 rounded-lg border ${
                              action.type === 'mafia' ? 'bg-red-500/10 border-red-500/30' :
                              action.type === 'doctor' ? 'bg-green-500/10 border-green-500/30' :
                              action.type === 'angel' ? 'bg-indigo-500/10 border-indigo-500/30' :
                              'bg-zinc-800 border-zinc-700'
                            }`}>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="font-bold">
                                  {action.actorName}
                                </span>
                                <span className="text-zinc-400">
                                  {action.type === 'mafia' && '🔪 zabil:'}
                                  {action.type === 'doctor' && '💉 zachránil:'}
                                  {action.type === 'angel' && '😇 oživil:'}
                                </span>
                                <span className="font-bold text-white">
                                  {action.targetName}
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center text-zinc-500 py-4">
                            Žádné akce zatím neproběhly...
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Akce pro jednotlivé role */}
                  {currentPlayer.role === 'mafia' && currentPlayer.alive && (
                    <div className="bg-red-500/5 border border-red-500/30 rounded-lg p-3 sm:p-4">
                      <p className="font-semibold text-sm sm:text-base text-red-200 mb-2">
                        Vyber oběť vraždy (jen živí hráči).
                      </p>
                      <div className="space-y-2">
                        {gameState.players
                          .filter((p) => p.alive && p.id !== currentPlayer.id && p.role !== 'mayor')
                          .map((p) => (
                            <button
                              key={p.id}
                              onClick={() => mafiaAction(p.id)}
                              className="w-full text-left px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-sm flex items-center justify-between"
                            >
                              <span>{p.name}</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {currentPlayer.role === 'doctor' && currentPlayer.alive && !currentPlayer.usedAbility && (
                    <div className="bg-green-500/5 border border-green-500/30 rounded-lg p-3 sm:p-4">
                      <p className="font-semibold text-sm sm:text-base text-green-200 mb-2">
                        Doktor: jednou za hru můžeš zachránit jednoho živého hráče (ne sebe).
                      </p>
                      <div className="space-y-2">
                        {gameState.players
                          .filter((p) => p.alive && p.id !== currentPlayer.id && p.role !== 'mayor')
                          .map((p) => (
                            <button
                              key={p.id}
                              onClick={() => doctorAction(p.id)}
                              className="w-full text-left px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-sm flex items-center justify-between"
                            >
                              <span>{p.name}</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {currentPlayer.role === 'angel' && currentPlayer.alive && !currentPlayer.usedAbility && (
                    <div className="bg-indigo-500/5 border border-indigo-500/30 rounded-lg p-3 sm:p-4">
                      <p className="font-semibold text-sm sm:text-base text-indigo-200 mb-2">
                        Anděl: jednou za hru můžeš oživit libovolného hráče kromě sebe (živého nebo mrtvého).
                      </p>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {gameState.players
                          .filter((p) => p.id !== currentPlayer.id && p.role !== 'mayor')
                          .map((p) => (
                            <button
                              key={p.id}
                              onClick={() => angelAction(p.id)}
                              className="w-full text-left px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-sm flex items-center justify-between"
                            >
                              <span>
                                {p.name}{' '}
                                {!p.alive && <span className="text-xs text-red-300">(mrtvý)</span>}
                              </span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {isMayor && (
                    <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-3 sm:p-4 text-xs sm:text-sm text-zinc-300 space-y-2">
                      <p className="font-semibold text-zinc-100">Starosta</p>
                      <p>
                        Jakmile všichni provedou své noční akce, klikni na tlačítko níže. Noc se vyhodnotí a přejde se na ráno.
                      </p>
                      <button
                        onClick={resolveNight}
                        className="mt-2 w-full bg-yellow-500 hover:bg-yellow-600 text-black font-semibold py-2.5 sm:py-3 rounded-lg text-sm sm:text-base transition-all"
                      >
                        ☀️ Ukončit noc a probudit městečko
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'day' && (
          <div className="max-w-3xl mx-auto">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-8">
              <div className="text-center mb-6 sm:mb-8">
                <h2 className="text-xl sm:text-2xl font-bold mb-2 sm:mb-3">Ráno v Palermu 🌤️</h2>
                <p className="text-sm sm:text-base text-zinc-400">
                  Starosta oznámí, kdo (případně) byl v noci zabit nebo zachráněn. Potom následuje volná diskuze.
                </p>
              </div>

              {gameState.lastNightVictimId && (
                <div className="mb-6 sm:mb-8 bg-red-500/10 border border-red-500/30 rounded-lg p-3 sm:p-4 text-sm sm:text-base text-red-100 flex items-center gap-3">
                  <span className="text-xl">💀</span>
                  <span>
                    Podle Starosty byla v noci zabita oběť. Pokud ji Doktor nebo Anděl nezachránili, je vyřazena ze hry.
                  </span>
                </div>
              )}

              <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 sm:p-4 text-xs sm:text-sm text-zinc-300 space-y-1.5 mb-4 sm:mb-6">
                <p className="font-semibold text-zinc-100">Co teď dělat:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Oběť se jako první krátce vyjádří a tipne vraha.</li>
                  <li>Potom diskutují všichni živí hráči – obviňujte, braňte se, hledejte nesrovnalosti.</li>
                  <li>Až Starosta uzná, že diskuze stačila, spustí hlasování.</li>
                </ul>
              </div>

              {isMayor && (
                <div className="text-center">
                  <button
                    onClick={startVoting}
                    className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold py-2.5 sm:py-3 px-6 sm:px-8 text-sm sm:text-base rounded-lg transition-all"
                  >
                    🗳️ Ukončit diskuzi a spustit hlasování
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'voting' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-8">
              <div className="text-center mb-6 sm:mb-8">
                <h2 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">Hlasování 🗳️</h2>
                <p className="text-sm sm:text-base text-zinc-400">
                  Každý živý hráč (kromě Starosty) nahlas řekne, koho chce popravit. V aplikaci zvol svého podezřelého.
                </p>
              </div>
              
              <div className="space-y-2 sm:space-y-3">
                {gameState.players
                  .filter((p) => p.id !== playerId && p.alive && p.role !== 'mayor')
                  .map((player) => {
                    const voteCount = Object.values(gameState.votes).filter((v) => v === player.id).length;
                    return (
                      <button
                        key={player.id}
                        onClick={() => vote(player.id)}
                        disabled={!!votedFor}
                        className={`w-full p-3 sm:p-4 rounded-lg text-left transition-all border ${
                          votedFor === player.id
                            ? 'bg-green-500/10 border-green-500/30'
                            : votedFor
                            ? 'bg-zinc-800/50 border-zinc-700/50 opacity-50 cursor-not-allowed'
                            : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 active:bg-zinc-700'
                        }`}
                      >
                        <div className="flex justify-between items-center gap-2">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center font-bold text-xs sm:text-sm flex-shrink-0">
                              {player.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold text-sm sm:text-base truncate">{player.name}</span>
                          </div>
                          {voteCount > 0 && (
                            <span className="text-xs sm:text-sm bg-zinc-700 px-2 sm:px-3 py-1 rounded-full flex-shrink-0">
                              {voteCount} {voteCount === 1 ? 'hlas' : 'hlasy'}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
              
              {votedFor && (
                <div className="mt-4 sm:mt-6 text-center bg-zinc-800 rounded-lg p-3 sm:p-4">
                  <p className="text-zinc-400 text-xs sm:text-sm">
                    Hlasovalo: {Object.keys(gameState.votes).length}/
                    {gameState.players.filter((p) => p.alive && p.role !== 'mayor').length}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'end' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold text-center mb-2 sm:mb-3">Konec hry 🏆</h2>
              {gameState.winner && (
                <p className="text-center text-sm sm:text-base mb-6 sm:mb-8 text-zinc-300">
                  {gameState.winner === 'citizens'
                    ? 'Vyhrálo městečko! Vrazi byli odhaleni a spravedlnost zvítězila.'
                    : 'Vrazi ovládli městečko. Občané byli přelstěni.'}
                </p>
              )}
              
              <div className="space-y-2 sm:space-y-3 mb-6 sm:mb-8">
                {gameState.players.map((player) => {
                  const voteCount = Object.values(gameState.votes).filter((v) => v === player.id).length;
                  return (
                    <div
                      key={player.id}
                      className={`p-3 sm:p-4 rounded-lg border ${
                        player.role === 'mafia'
                          ? 'bg-red-500/10 border-red-500/30'
                          : player.role === 'mayor'
                          ? 'bg-yellow-500/10 border-yellow-500/30'
                          : 'bg-zinc-800 border-zinc-700'
                      }`}
                    >
                      <div className="flex justify-between items-center gap-3">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm flex-shrink-0 ${
                            player.role === 'mafia' 
                              ? 'bg-gradient-to-br from-red-500 to-red-700' 
                              : player.role === 'mayor'
                              ? 'bg-gradient-to-br from-yellow-400 to-yellow-600'
                              : 'bg-gradient-to-br from-purple-500 to-pink-600'
                          }`}>
                            {player.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-sm sm:text-base break-all">{player.name}</span>
                              {player.id === playerId && (
                                <span className="text-[10px] sm:text-xs bg-purple-500/20 text-purple-400 px-1.5 sm:px-2 py-0.5 rounded flex-shrink-0">Ty</span>
                              )}
                              {player.role === 'mafia' && (
                                <span className="text-[10px] sm:text-xs bg-red-500/20 text-red-400 px-1.5 sm:px-2 py-0.5 rounded font-semibold flex-shrink-0">
                                  Vrah 🔪
                                </span>
                              )}
                              {player.role === 'detective' && (
                                <span className="text-[10px] sm:text-xs bg-blue-500/20 text-blue-400 px-1.5 sm:px-2 py-0.5 rounded flex-shrink-0">
                                  Detektiv 🕵️
                                </span>
                              )}
                              {player.role === 'doctor' && (
                                <span className="text-[10px] sm:text-xs bg-green-500/20 text-green-400 px-1.5 sm:px-2 py-0.5 rounded flex-shrink-0">
                                  Doktor 💉
                                </span>
                              )}
                              {player.role === 'angel' && (
                                <span className="text-[10px] sm:text-xs bg-indigo-500/20 text-indigo-400 px-1.5 sm:px-2 py-0.5 rounded flex-shrink-0">
                                  Anděl 😇
                                </span>
                              )}
                              {player.role === 'mayor' && (
                                <span className="text-[10px] sm:text-xs bg-yellow-500/20 text-yellow-400 px-1.5 sm:px-2 py-0.5 rounded flex-shrink-0">
                                  Starosta 👑
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs sm:text-sm bg-zinc-700 px-2 sm:px-3 py-1 rounded-full whitespace-nowrap">
                          {voteCount} {voteCount === 1 ? 'hlas' : 'hlasy'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {isMayor && (
                <button
                  onClick={nextRound}
                  className="w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2.5 sm:py-3 text-sm sm:text-base rounded-lg transition-all"
                >
                  🔄 Nová hra v Palermu
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}