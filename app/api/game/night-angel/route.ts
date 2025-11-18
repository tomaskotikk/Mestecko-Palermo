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

    if (!player || !player.alive || player.role !== 'angel') {
      return NextResponse.json(
        { error: 'Pouze živý Anděl může použít schopnost.' },
        { status: 400 }
      );
    }

    if (player.usedAbility) {
      return NextResponse.json(
        { error: 'Anděl už svou schopnost použil.' },
        { status: 400 }
      );
    }

    if (!target || target.id === player.id) {
      return NextResponse.json(
        { error: 'Anděl může jednou za hru oživit libovolného hráče kromě sebe.' },
        { status: 400 }
      );
    }

    room.angelTargetId = targetId;
    player.usedAbility = true;

    // Přidej akci do nightActions pro Starostu
    room.nightActions = room.nightActions || [];
    room.nightActions.push({
      type: 'angel',
      actorId: player.id,
      actorName: player.name,
      targetId: target.id,
      targetName: target.name,
    });

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
      nightActions: room.nightActions,
    });

    // Pošli soukromou notifikaci Starostovi (pokud existuje)
    if (room.mayorId) {
      try {
        await pusherServer.trigger(`private-player-${room.mayorId}`, 'actionOccurred', {
          message: `${player.name}: 😇 oživil ${target.name}`,
          type: 'angel',
          actorId: player.id,
          targetId: target.id,
        });
      } catch (err) {
        console.error('Failed to notify mayor about angel action', err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in night-angel:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}