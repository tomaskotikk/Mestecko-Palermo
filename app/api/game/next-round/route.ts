import { NextRequest, NextResponse } from 'next/server';
import { getRoom } from '@/lib/game-state';
import { pusherServer } from '@/lib/pusher';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { roomCode, playerId } = await request.json();
    
    if (!roomCode || !playerId) {
      return NextResponse.json(
        { error: 'Room code and player ID are required' },
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

    // Check if player je Starosta
    if (!room.mayorId || room.mayorId !== playerId) {
      return NextResponse.json(
        { error: 'Pouze host může spustit novou hru!' },
        { status: 403 }
      );
    }

    // Reset hry – zpět do lobby
    room.gameStarted = false;
    room.gamePhase = 'lobby';
    room.votes = {};
    room.mafiaIds = [];
    room.detectiveId = undefined;
    room.doctorId = undefined;
    room.angelId = undefined;
    room.mayorId = undefined;
    room.lastNightVictimId = undefined;
    room.lastLynchedId = undefined;
    room.winner = undefined;
    room.mafiaTargetId = undefined;
    room.doctorTargetId = undefined;
    room.angelTargetId = undefined;

    room.players.forEach((player) => {
      player.role = undefined;
      player.alive = true;
      player.usedAbility = false;
    });

    // Broadcast game state to room
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error starting next round:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

