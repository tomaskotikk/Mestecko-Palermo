import { NextRequest, NextResponse } from 'next/server';
import { getRoom } from '@/lib/game-state';
import { pusherServer } from '@/lib/pusher';

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

    if (room.votes[playerId]) {
      return NextResponse.json(
        { error: 'Už jsi hlasoval!' },
        { status: 400 }
      );
    }

    room.votes[playerId] = votedForId;

    // Broadcast game state to room
    await pusherServer.trigger(`room-${normalizedRoomCode}`, 'gameState', {
      players: room.players,
      gameStarted: room.gameStarted,
      gamePhase: room.gamePhase,
      category: room.category,
      customWords: room.customWords,
      impostorId: room.impostorId,
      votes: room.votes,
      roomCode: normalizedRoomCode,
      maxPlayers: room.maxPlayers,
    });

    // Pokud všichni hlasovali, přejdi na výsledky
    if (Object.keys(room.votes).length === room.players.length) {
      setTimeout(async () => {
        room.gamePhase = 'results';
        await pusherServer.trigger(`room-${normalizedRoomCode}`, 'gameState', {
          players: room.players,
          gameStarted: room.gameStarted,
          gamePhase: room.gamePhase,
          category: room.category,
          customWords: room.customWords,
          impostorId: room.impostorId,
          votes: room.votes,
          roomCode: normalizedRoomCode,
          maxPlayers: room.maxPlayers,
        });
      }, 2000);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error voting:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

