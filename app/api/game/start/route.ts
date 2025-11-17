import { NextRequest, NextResponse } from 'next/server';
import { getRoom, type Player } from '@/lib/game-state';
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

    // Check if player is host (first player)
    if (room.players.length === 0 || room.players[0].id !== playerId) {
      return NextResponse.json(
        { error: 'Pouze host může spustit hru!' },
        { status: 403 }
      );
    }

    if (room.players.length !== room.maxPlayers) {
      return NextResponse.json(
        { error: `Musí být přesně ${room.maxPlayers} hráčů!` },
        { status: 400 }
      );
    }

    if (room.gameStarted) {
      return NextResponse.json(
        { error: 'Hra již běží!' },
        { status: 400 }
      );
    }

    // Nastav Starostu náhodně
    const mayorIndex = Math.floor(Math.random() * room.players.length);
    const mayor = room.players[mayorIndex];
    room.mayorId = mayor.id;

    // Všichni hráči jsou na začátku naživu
    room.players.forEach((player) => {
      player.alive = true;
      player.usedAbility = false;
      player.role = undefined;
    });

    // Pomocná funkce pro shuffle (bez Starosty)
    const shuffledPlayers: Player[] = room.players.filter((p) => p.id !== mayor.id);
    for (let i = shuffledPlayers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledPlayers[i], shuffledPlayers[j]] = [shuffledPlayers[j], shuffledPlayers[i]];
    }

    // Jednodušší nastavení rolí:
    // - 1–2 Vrazi podle počtu hráčů
    // - 1 Detektiv, 1 Doktor, 1 Anděl (pokud je dost hráčů)
    const nonMayorCount = shuffledPlayers.length;
    const mafiaCount = nonMayorCount >= 7 ? 2 : 1;

    room.mafiaIds = [];
    room.detectiveId = undefined;
    room.doctorId = undefined;
    room.angelId = undefined;

    let index = 0;

    // Vrazi
    for (let m = 0; m < mafiaCount && index < shuffledPlayers.length; m++, index++) {
      const p = shuffledPlayers[index];
      p.role = 'mafia';
      room.mafiaIds.push(p.id);
    }

    // Detektiv
    if (index < shuffledPlayers.length) {
      const p = shuffledPlayers[index++];
      p.role = 'detective';
      room.detectiveId = p.id;
    }

    // Doktor
    if (index < shuffledPlayers.length) {
      const p = shuffledPlayers[index++];
      p.role = 'doctor';
      room.doctorId = p.id;
    }

    // Anděl – pouze pokud zbývá někdo další
    if (index < shuffledPlayers.length) {
      const p = shuffledPlayers[index++];
      p.role = 'angel';
      room.angelId = p.id;
    }

    // Zbytek jsou Občané
    for (; index < shuffledPlayers.length; index++) {
      const p = shuffledPlayers[index];
      p.role = 'citizen';
    }

    // Starosta (host) – speciální role mimo hru, nehlasuje, neúčastní se noci
    mayor.role = 'mayor';

    room.gameStarted = true;
    room.gamePhase = 'night';
    room.votes = {};
    room.lastNightVictimId = undefined;
    room.lastLynchedId = undefined;
    room.winner = undefined;

    // Pošli každému hráči jeho roli (soukromě)
    for (const player of room.players) {
      await pusherServer.trigger(`private-player-${player.id}`, 'roleAssigned', {
        role: player.role,
      });
    }

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
    console.error('Error starting game:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}