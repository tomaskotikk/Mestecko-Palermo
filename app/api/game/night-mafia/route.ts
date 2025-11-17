import { NextRequest, NextResponse } from 'next/server';
import { getRoom } from '@/lib/game-state';
import { pusherServer } from '@/lib/pusher';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { roomCode, playerId, targetId } = await request.json();

    if (!roomCode || !playerId || !targetId) {
      return NextResponse.json(
        { error: 'Room code, player ID a cíl jsou povinné' },
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

    const player = room.players.find((p) => p.id === playerId);
    const target = room.players.find((p) => p.id === targetId);

    if (!player || !player.alive || player.role !== 'mafia') {
      return NextResponse.json(
        { error: 'Pouze živý Vrah může vybrat oběť.' },
        { status: 400 }
      );
    }

    if (!target || !target.alive) {
      return NextResponse.json(
        { error: 'Cíl musí být živý hráč.' },
        { status: 400 }
      );
    }

    room.mafiaTargetId = targetId;

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
    console.error('Error in night-mafia:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


