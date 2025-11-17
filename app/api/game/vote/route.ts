import { NextRequest, NextResponse } from 'next/server';
import { getRoom } from '@/lib/game-state';
import { pusherServer } from '@/lib/pusher';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { roomCode, playerId, votedForId } = await request.json();
    
    if (!roomCode || !playerId || !votedForId) {
      return NextResponse.json(
        { error: 'Room code, player ID and voted for ID are required' },
        { status: 400 }
      );
    }

    const normalizedRoomCode = roomCode.toUpperCase();
    const room = getRoom(normalizedRoomCode);
    
    if (!room) {
      return NextResponse.json(
        { error: 'Místnost neexistuje!' },
        { status: 404 }
      );
    }

    if (room.gamePhase !== 'voting') {
      return NextResponse.json(
        { error: 'Hlasování není aktivní!' },
        { status: 400 }
      );
    }

    const votingPlayer = room.players.find((p) => p.id === playerId);
    const targetPlayer = room.players.find((p) => p.id === votedForId);

    if (!votingPlayer || !votingPlayer.alive || votingPlayer.role === 'mayor') {
      return NextResponse.json(
        { error: 'Tento hráč nemůže hlasovat.' },
        { status: 400 }
      );
    }

    if (!targetPlayer || !targetPlayer.alive) {
      return NextResponse.json(
        { error: 'Nelze hlasovat pro mrtvého hráče.' },
        { status: 400 }
      );
    }

    // Povolit přehlasování (změnu hlasu) – počítají se pouze hlasy živých
    room.votes[playerId] = votedForId;

    // Počet možných hlasů = počet živých hráčů bez Starosty
    const aliveVoters = room.players.filter(
      (p) => p.alive && p.role !== 'mayor'
    ).length;

    // Broadcast průběžného stavu
    await pusherServer.trigger(`room-${normalizedRoomCode}`, 'gameState', {
      players: room.players,
      gameStarted: room.gameStarted,
      gamePhase: room.gamePhase,
      votes: room.votes,
      roomCode: normalizedRoomCode,
      maxPlayers: room.maxPlayers,
      mafiaIds: room.mafiaIds,
      mayorId: room.mayorId,
      lastNightVictimId: room.lastNightVictimId,
      lastLynchedId: room.lastLynchedId,
      winner: room.winner,
    });

    // Pokud všichni živí (bez Starosty) hlasovali, vyhodnoť lynč
    const uniqueVotersCount = Object.keys(room.votes).filter((id) => {
      const p = room.players.find((pl) => pl.id === id);
      return p && p.alive && p.role !== 'mayor';
    }).length;

    if (uniqueVotersCount >= aliveVoters && aliveVoters > 0) {
      // Najdi hráče s nejvyšším počtem hlasů
      const voteCounts: Record<string, number> = {};
      Object.values(room.votes).forEach((targetId) => {
        voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
      });

      let lynchedId: string | undefined;
      let maxVotes = 0;
      for (const [targetId, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) {
          maxVotes = count;
          lynchedId = targetId;
        } else if (count === maxVotes) {
          // Remíza – nikdo nebude automaticky popraven, rozhodne Starosta mimo aplikaci
          lynchedId = undefined;
        }
      }

      if (lynchedId) {
        const lynched = room.players.find((p) => p.id === lynchedId);
        if (lynched) {
          lynched.alive = false;
          room.lastLynchedId = lynched.id;
        }
      }

      // Zkontroluj vítěze
      const aliveMafia = room.players.filter((p) => p.alive && p.role === 'mafia').length;
      const aliveCitizens = room.players.filter(
        (p) => p.alive && (p.role === 'citizen' || p.role === 'detective' || p.role === 'doctor' || p.role === 'angel')
      ).length;

      if (aliveMafia === 0) {
        room.gamePhase = 'end';
        room.winner = 'citizens';
      } else if (aliveMafia >= aliveCitizens) {
        room.gamePhase = 'end';
        room.winner = 'mafia';
      } else {
        // Další noc
        room.gamePhase = 'night';
        room.votes = {};
      }

      await pusherServer.trigger(`room-${normalizedRoomCode}`, 'gameState', {
        players: room.players,
        gameStarted: room.gameStarted,
        gamePhase: room.gamePhase,
        votes: room.votes,
        roomCode: normalizedRoomCode,
        maxPlayers: room.maxPlayers,
        mafiaIds: room.mafiaIds,
        mayorId: room.mayorId,
        lastNightVictimId: room.lastNightVictimId,
        lastLynchedId: room.lastLynchedId,
        winner: room.winner,
      });
    }

    return NextResponse.json({ success: true, votes: room.votes });
  } catch (error) {
    console.error('Error voting:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}