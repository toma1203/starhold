import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { victoryPoints } from '../src/scoring.ts';
import { RESOURCES } from '../src/types.ts';
import type { GameState } from '../src/types.ts';
import { randomStep } from './driver.ts';
import { makeGame } from './helpers.ts';

const MAX_ACTIONS = 20_000;
// The engine's tsconfig has no node typings; read the environment through globalThis.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env;
const envInt = (name: string): number | undefined => {
  const raw = env[name];
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`${name} must be an integer, got ${raw}`);
  return n;
};
const NUM_RUNS = envInt('FC_RUNS') ?? 300;
const FC_SEED = envInt('FC_SEED');

/** First broken whole-game invariant in `s`, or null. Hand-rolled (not `expect`) to stay fast. */
function violation(s: GameState): string | null {
  const homes = new Map(s.players.map((p) => [p.homeId, p.id]));
  const vp = new Map(s.players.map((p) => [p.id, 0]));
  for (const p of s.players) {
    for (const r of RESOURCES) {
      if (!Number.isInteger(p.resources[r]) || p.resources[r] < 0) {
        return `${p.id} has ${p.resources[r]} ${r}`;
      }
    }
  }
  for (const id of s.sectorIds) {
    const sec = s.sectors[id];
    if (!sec) return `missing sector ${id}`;
    if (sec.owner === null) {
      if (sec.fleets !== 0 || sec.structure !== 'none') {
        return `unowned ${id} has ${sec.fleets} fleets / ${sec.structure}`;
      }
    } else {
      if (!vp.has(sec.owner)) return `${id} owned by unknown ${sec.owner}`;
      if (!Number.isInteger(sec.fleets) || sec.fleets < 1) {
        return `owned ${id} has ${sec.fleets} fleets`;
      }
      const gain = sec.structure === 'starbase' ? 2 : sec.structure === 'colony' ? 1 : 0;
      vp.set(sec.owner, (vp.get(sec.owner) ?? 0) + gain);
    }
    const homeOwner = homes.get(id);
    if (homeOwner !== undefined && sec.owner !== homeOwner)
      return `home ${id} lost by ${homeOwner}`;
  }
  if (s.phase !== 'DISCARD' && Object.keys(s.pendingDiscards).length > 0) {
    return `pendingDiscards in ${s.phase}`;
  }
  if (s.phase === 'DISCARD' && Object.keys(s.pendingDiscards).length === 0) {
    return 'DISCARD with nothing pending';
  }
  for (const p of s.players) {
    const expected =
      (vp.get(p.id) ?? 0) +
      2 * ((s.awards.largestEmpire === p.id ? 1 : 0) + (s.awards.warlord === p.id ? 1 : 0));
    if (victoryPoints(s, p.id) !== expected) {
      return `${p.id} VP ${victoryPoints(s, p.id)} != recomputed ${expected}`;
    }
  }
  if (s.phase === 'FINISHED' && (s.winner === null || s.endReason === null)) {
    return 'finished without winner';
  }
  if (s.phase !== 'FINISHED' && (s.winner !== null || s.endReason !== null)) {
    return 'winner before the end';
  }
  return null;
}

describe('whole-game properties', () => {
  it(`random legal play keeps every invariant and always finishes (${NUM_RUNS} games)`, () => {
    fc.assert(
      fc.property(
        fc.record({
          seed: fc.integer({ min: 0, max: 0x7fffffff }),
          players: fc.constantFrom<2 | 3 | 4>(2, 3, 4),
          targetVp: fc.constantFrom<6 | 8 | 10>(6, 8, 10),
          driver: fc.integer({ min: 0, max: 0x7fffffff }),
        }),
        ({ seed, players, targetVp, driver }) => {
          let state = makeGame({ players, seed, targetVp });
          let driverSeed = driver;
          const first = violation(state);
          if (first) throw new Error(`initial state: ${first}`);
          let actions = 0;
          while (state.phase !== 'FINISHED' && actions < MAX_ACTIONS) {
            const step = randomStep(state, driverSeed);
            state = step.state;
            driverSeed = step.seed;
            actions++;
            const broken = violation(state);
            if (broken) {
              throw new Error(
                `after action ${actions} ${JSON.stringify(step.action)} by ${step.playerId}: ${broken}`,
              );
            }
          }
          expect(state.phase).toBe('FINISHED');
          expect(state.winner).not.toBeNull();
          expect(state.players.map((p) => p.id)).toContain(state.winner);
        },
      ),
      { numRuns: NUM_RUNS, ...(FC_SEED === undefined ? {} : { seed: FC_SEED }) },
    );
  }, 600_000);
});
