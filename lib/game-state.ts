export type Role =
  | 'mayor'      // Starosta – moderátor hry (host), nehlasuje
  | 'citizen'    // Občan
  | 'mafia'      // Vrah
  | 'detective'  // Detektiv (Katány)
  | 'doctor'     // Doktor
  | 'angel';     // Anděl

export interface Player {
  id: string;
  name: string;
  role?: Role;
  alive: boolean;
  usedAbility?: boolean; // pro Doktora/Anděla – jednorázová schopnost
}

export type GamePhase = 'lobby' | 'night' | 'day' | 'voting' | 'end';

export interface GameRoom {
  players: Player[];
  gameStarted: boolean;
  gamePhase: GamePhase;
  votes: Record<string, string>; // kdo pro koho hlasoval
  maxPlayers: number;
  mafiaIds: string[];
  detectiveId?: string;
  doctorId?: string;
  angelId?: string;
  mayorId?: string;
  lastNightVictimId?: string;
  lastLynchedId?: string;
  winner?: 'citizens' | 'mafia';
  // noční volby
  mafiaTargetId?: string;
  doctorTargetId?: string;
  angelTargetId?: string;
  // noční akce pro Starostu (historie během noci)
  nightActions?: Array<{
    type: 'mafia' | 'doctor' | 'angel' | 'sheriff';
    actorId: string;
    actorName: string;
    targetId: string;
    targetName: string;
  }>;
}
  
  const rooms = new Map<string, GameRoom>();
  
  function generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
  
  export function createRoom(maxPlayers = 8): string {
    let code: string;
    do {
      code = generateRoomCode();
    } while (rooms.has(code));
    
    rooms.set(code, {
      players: [],
      gameStarted: false,
      gamePhase: 'lobby',
      votes: {},
      maxPlayers: maxPlayers,
      mafiaIds: [],
      nightActions: [],
    });
    return code;
  }
  
  export function getRoom(roomCode: string): GameRoom | undefined {
    return rooms.get(roomCode);
  }
  
  // PŘIDÁNO: Funkce pro aktualizaci místnosti
  export function updateRoom(roomCode: string, room: GameRoom): void {
    rooms.set(roomCode, room);
  }
  
  export function getAllRooms(): Map<string, GameRoom> {
    return rooms;
  }
  
  export function deleteRoom(roomCode: string): boolean {
    return rooms.delete(roomCode);
  }