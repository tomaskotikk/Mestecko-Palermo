import { NextRequest, NextResponse } from 'next/server';
import { getRoom } from '@/lib/game-state';
import { pusherServer } from '@/lib/pusher';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { roomCode, playerId } = await request.json();

    if (!roomCode || !playerId) {
      return NextResponse.json(
        { error: 'Room code a player ID jsou povinné' },
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

    if (!room.mayorId || room.mayorId !== playerId) {
      return NextResponse.json(
        { error: 'Pouze Starosta může ukončit noc.' },
        { status: 403 }
      );
    }

    if (room.gamePhase !== 'night') {
      return NextResponse.json(
        { error: 'Noc aktuálně neprobíhá.' },
        { status: 400 }
      );
    }

    let nightVictimId: string | undefined = undefined;

    // 1) Aplikuj andělovo oživení (může proběhnout kdykoliv)
    if (room.angelTargetId) {
      const target = room.players.find((p) => p.id === room.angelTargetId);
      if (target) {
        target.alive = true;
      }
    }

    // 2) Základní oběť mafie
    if (room.mafiaTargetId) {
      const mafiaTarget = room.players.find((p) => p.id === room.mafiaTargetId);

      if (mafiaTarget && mafiaTarget.alive) {
        // 3) Doktor – pokud chrání stejný cíl, oběť přežije
        if (!room.doctorTargetId || room.doctorTargetId !== room.mafiaTargetId) {
          mafiaTarget.alive = false;
          nightVictimId = mafiaTarget.id;
        }
      }
    }

    room.lastNightVictimId = nightVictimId;

    // Vyčisti noční volby pro další noc
    room.mafiaTargetId = undefined;
    room.doctorTargetId = undefined;
    room.angelTargetId = undefined;

    // Kontrola vítězství po noci
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
      room.gamePhase = 'day';
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error resolving night:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


