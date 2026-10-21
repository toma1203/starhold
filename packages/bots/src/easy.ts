import { legalActions, RESOURCES } from '@starhold/engine';
import type { Action, PlayerId, PlayerView, Resource, ResourceBag } from '@starhold/engine';
import { leastHeld } from './eval.ts';

const BUILD_CHANCE = 0.6;

/** Uniform pick; `random()` is in [0, 1). */
function pickRandom<T>(items: readonly T[], random: () => number): T | undefined {
  return items[Math.floor(random() * items.length)];
}

/** A random discard of exactly `count` cards from the hand. */
export function easyDiscard(
  view: PlayerView,
  me: PlayerId,
  count: number,
  random: () => number,
): Action {
  const held: ResourceBag = {
    ...(view.players.find((p) => p.id === me)?.resources ?? emptyHand()),
  };
  const resources = emptyHand();
  for (let left = count; left > 0; left--) {
    const cards = RESOURCES.flatMap((r) => Array<Resource>(held[r]).fill(r));
    const card = pickRandom(cards, random);
    if (!card) break;
    held[card] -= 1;
    resources[card] += 1;
  }
  return { type: 'discard', resources };
}

function emptyHand(): ResourceBag {
  return { metal: 0, energy: 0, crystal: 0, biomass: 0 };
}

/** The easy bot: builds and expands at random, rarely fights, never fortifies. */
export function chooseEasy(view: PlayerView, me: PlayerId, random: () => number): Action | null {
  const legal = legalActions(view, me);
  switch (view.phase) {
    case 'HOME_BONUS':
      return { type: 'chooseHomeBonus', resource: leastHeld(view, me) };
    case 'ROLL':
      return legal.find((a) => a.type === 'roll') ?? null;
    case 'PIRATE': {
      const moves = legal.flatMap((a) => (a.type === 'movePirate' ? [a] : []));
      const elsewhere = moves.filter((a) => view.sectors[a.to]?.owner !== me);
      return pickRandom(elsewhere.length > 0 ? elsewhere : moves, random) ?? null;
    }
    case 'MAIN': {
      const endTurn = legal.find((a) => a.type === 'endTurn') ?? null;
      if (random() >= BUILD_CHANCE) return endTurn;
      const options = legal.filter(
        (a) =>
          a.type === 'buildFleet' ||
          a.type === 'buildColony' ||
          a.type === 'buildStarbase' ||
          a.type === 'expand' ||
          (a.type === 'attack' && a.dice === 3),
      );
      return pickRandom(options, random) ?? endTurn;
    }
    default:
      return null;
  }
}
