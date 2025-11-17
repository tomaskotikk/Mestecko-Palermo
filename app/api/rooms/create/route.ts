import { NextRequest, NextResponse } from 'next/server';
import { createRoom, getRoom } from '@/lib/game-state';
import { pusherServer } from '@/lib/pusher';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { name, maxPlayers } = await request.json();
    
    if (!name || maxPlayers === undefined || maxPlayers === null) {
      return NextResponse.json(
        { error: 'Name and maxPlayers are required' },
        { status: 400 }
      );
    }

    const maxPlayersNum = parseInt(maxPlayers, 10);
    if (isNaN(maxPlayersNum) || maxPlayersNum < 6 || maxPlayersNum > 15) {
      return NextResponse.json(
        { error: 'Počet hráčů musí být mezi 6 a 15 pro Městečko Palermo.' },
        { status: 400 }
      );
    }

    const roomCode = createRoom(maxPlayersNum);
    const room = getRoom(roomCode);
    
    if (!room) {
      return NextResponse.json(
        { error: 'Failed to create room' },
        { status: 500 }
      );
    }

    const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    room.players.push({
      id: playerId,
      name,
      alive: true,
    });

    // Broadcast game state to room
    await pusherServer.trigger(`room-${roomCode}`, 'gameState', {
      players: room.players,
      gameStarted: room.gameStarted,
      gamePhase: room.gamePhase,
      votes: room.votes,
      roomCode: roomCode,
      maxPlayers: room.maxPlayers,
      mafiaIds: room.mafiaIds,
      mayorId: room.mayorId,
      lastNightVictimId: room.lastNightVictimId,
      lastLynchedId: room.lastLynchedId,
      winner: room.winner,
    });

    return NextResponse.json({
      roomCode,
      playerId,
    });
  } catch (error) {
    console.error('Error creating room:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

