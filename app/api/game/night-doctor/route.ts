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

    if (!player || !player.alive || player.role !== 'doctor') {
      return NextResponse.json(
        { error: 'Pouze živý Doktor může použít schopnost.' },
        { status: 400 }
      );
    }

    if (player.usedAbility) {
      return NextResponse.json(
        { error: 'Doktor už svou schopnost použil.' },
        { status: 400 }
      );
    }

    if (!target || !target.alive || target.id === player.id) {
      return NextResponse.json(
        { error: 'Doktor může jednou za hru zachránit jiného živého hráče.' },
        { status: 400 }
      );
    }

    room.doctorTargetId = targetId;
    player.usedAbility = true;

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
    console.error('Error in night-doctor:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


