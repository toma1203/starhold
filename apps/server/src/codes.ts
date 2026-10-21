import { randomBytes, randomInt } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const MAX_ATTEMPTS = 1000;
const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';

/** `random` returns a float in [0, 1); injectable so tests are deterministic. */
export function generateRoomCode(random: () => number, taken: (code: string) => boolean): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET.charAt(Math.floor(random() * CODE_ALPHABET.length));
    }
    if (!taken(code)) return code;
  }
  throw new Error('could not generate a free room code');
}

/** 16 random bytes as 32 lowercase hex chars (matches the protocol TokenSchema). */
export function generateToken(): string {
  return randomBytes(16).toString('hex');
}

/** 8 random base36 characters. */
export function generatePlayerId(): string {
  let id = '';
  for (let i = 0; i < 8; i += 1) id += BASE36.charAt(randomInt(BASE36.length));
  return id;
}
