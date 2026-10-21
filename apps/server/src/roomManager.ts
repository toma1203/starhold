import { randomInt } from 'node:crypto';
import { generateRoomCode } from './codes.ts';
import type { Config } from './config.ts';
import { Room, type RoomHooks } from './room.ts';

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly config: Config,
    private readonly hooks: RoomHooks,
  ) {}

  get size(): number {
    return this.rooms.size;
  }

  create(): Room | { error: 'err.serverFull' } {
    if (this.rooms.size >= this.config.maxRooms) return { error: 'err.serverFull' };
    const code = generateRoomCode(
      () => randomInt(0, 2 ** 32) / 2 ** 32,
      (c) => this.rooms.has(c),
    );
    const room = new Room(code, this.config, this.hooks);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  delete(code: string): boolean {
    const key = code.toUpperCase();
    this.rooms.get(key)?.dispose();
    return this.rooms.delete(key);
  }

  /** Pure lookup (does not reconnect anyone; call `room.rejoin` for that). */
  findByToken(code: string, token: string): { room: Room; playerId: string } | null {
    const room = this.get(code);
    const playerId = room?.playerIdForToken(token) ?? null;
    return room && playerId ? { room, playerId } : null;
  }

  /** Deletes expired rooms and returns their codes. */
  sweep(now: number): string[] {
    const deleted: string[] = [];
    for (const [code, room] of this.rooms) {
      const abandoned =
        room.emptySince !== null && now - room.emptySince >= this.config.emptyRoomTtlMs;
      const finished =
        room.phase === 'FINISHED' && now - room.lastActivity >= this.config.finishedRoomTtlMs;
      if (abandoned || finished) {
        room.dispose();
        this.rooms.delete(code);
        deleted.push(code);
      }
    }
    return deleted;
  }
}
