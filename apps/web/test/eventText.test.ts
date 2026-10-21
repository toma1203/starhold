import { describe, expect, it } from 'vitest';
import { createT } from '@starhold/i18n';
import type { Locale } from '@starhold/i18n';
import type { GameEvent } from '@starhold/engine';
import { battleVariant, eventText } from '../src/game/eventText.ts';
import { makeState, viewOf } from './mapFixtures.ts';

const view = viewOf(makeState(3, 1), 'p1');
const bag = (metal = 0, energy = 0, crystal = 0, biomass = 0) => ({
  metal,
  energy,
  crystal,
  biomass,
});

type Battle = Extract<GameEvent, { type: 'battle' }>;
const battle = (over: Partial<Battle> = {}): Battle => ({
  type: 'battle',
  attacker: 'p1',
  defender: 'p2',
  from: '1,-2',
  to: '1,-3',
  attackRoll: [6, 4],
  defendRoll: [5],
  attackerLosses: 0,
  defenderLosses: 1,
  conquered: false,
  ...over,
});

/** At least one sample per GameEvent type (the Record type forces completeness) plus variants. */
const SAMPLES: Record<GameEvent['type'], GameEvent[]> = {
  turnStarted: [{ type: 'turnStarted', player: 'p1', round: 3 }],
  homeBonus: [{ type: 'homeBonus', player: 'p2', resource: 'crystal' }],
  diceRolled: [{ type: 'diceRolled', player: 'p1', dice: [3, 4] }],
  produced: [
    { type: 'produced', gains: { p1: bag(2, 1), p2: bag(), p3: bag(0, 0, 0, 3) } },
    { type: 'produced', gains: { p1: bag(), p2: bag(), p3: bag() } },
  ],
  discarded: [1, 2, 5].map((count): GameEvent => ({ type: 'discarded', player: 'p1', count })),
  pirateMoved: [{ type: 'pirateMoved', player: 'p1', to: '1,-2' }],
  stolen: [
    { type: 'stolen', thief: 'p1', victim: 'p2', resource: 'metal' },
    { type: 'stolen', thief: 'p1', victim: 'p2', resource: null },
  ],
  bankTraded: [{ type: 'bankTraded', player: 'p1', give: 'metal', giveCount: 4, get: 'energy' }],
  tradeOffered: [
    {
      type: 'tradeOffered',
      offer: { from: 'p1', give: bag(2), want: bag(0, 1, 1), accepted: [], declined: [] },
    },
  ],
  tradeResponded: [
    { type: 'tradeResponded', player: 'p2', accept: true },
    { type: 'tradeResponded', player: 'p2', accept: false },
  ],
  traded: [{ type: 'traded', a: 'p1', b: 'p2', aGave: bag(2), bGave: bag(0, 1) }],
  tradeCancelled: [{ type: 'tradeCancelled' }],
  built: (['fleet', 'colony', 'starbase'] as const).map((what): GameEvent => ({
    type: 'built',
    player: 'p1',
    what,
    at: '1,-2',
  })),
  expanded: [1, 2, 5].map((count): GameEvent => ({
    type: 'expanded',
    player: 'p1',
    from: '1,-2',
    to: '1,-3',
    count,
  })),
  battle: [
    battle(),
    battle({ defenderLosses: 0, attackerLosses: 1 }),
    battle({ conquered: true, defenderLosses: 2 }),
  ],
  fortified: [1, 3, 11].map((count): GameEvent => ({
    type: 'fortified',
    player: 'p1',
    from: '1,-2',
    to: '2,-2',
    count,
  })),
  awardChanged: [
    { type: 'awardChanged', award: 'largestEmpire', player: 'p1' },
    { type: 'awardChanged', award: 'largestEmpire', player: null },
    { type: 'awardChanged', award: 'warlord', player: 'p3' },
    { type: 'awardChanged', award: 'warlord', player: null },
  ],
  gameOver: [
    { type: 'gameOver', winner: 'p1', reason: 'target' },
    { type: 'gameOver', winner: 'p2', reason: 'roundLimit' },
  ],
};

describe('eventText', () => {
  it.each(['en', 'hr'] as Locale[])(
    'covers every GameEvent type in %s without missing keys or placeholders',
    (locale) => {
      const t = createT(locale);
      const all = Object.values(SAMPLES).flat();
      expect(all.length).toBeGreaterThanOrEqual(18);
      for (const event of all) {
        const text = eventText(event, view, t, locale);
        expect(text, JSON.stringify(event)).not.toContain('{');
        expect(text, JSON.stringify(event)).not.toContain('undefined');
        expect(text.trim().length, JSON.stringify(event)).toBeGreaterThan(0);
      }
    },
  );

  it('uses player names and formatted lists', () => {
    const t = createT('en');
    expect(eventText({ type: 'turnStarted', player: 'p1', round: 3 }, view, t, 'en')).toBe(
      "Pilot 1's turn, round 3",
    );
    expect(eventText({ type: 'diceRolled', player: 'p1', dice: [3, 4] }, view, t, 'en')).toBe(
      'Pilot 1 rolls 3 + 4 = 7',
    );
    expect(
      eventText(
        { type: 'traded', a: 'p1', b: 'p2', aGave: bag(2), bGave: bag(0, 1) },
        view,
        t,
        'en',
      ),
    ).toBe('Pilot 1 and Pilot 2 trade: Pilot 1 gives 2 Metal, Pilot 2 gives 1 Energy');
  });

  it('lists only players who produced something, or says nothing was produced', () => {
    const t = createT('en');
    const text = eventText(SAMPLES.produced[0]!, view, t, 'en');
    expect(text).toContain('Pilot 1 produces 2 Metal, 1 Energy');
    expect(text).toContain('Pilot 3 produces 3 Biomass');
    expect(text).not.toContain('Pilot 2');
    expect(eventText(SAMPLES.produced[1]!, view, t, 'en')).toBe(t('event.producedNothing'));
  });

  it('declines counted messages by locale', () => {
    const fortified = (count: number): GameEvent => ({
      type: 'fortified',
      player: 'p1',
      from: '1,-2',
      to: '2,-2',
      count,
    });
    expect(eventText(fortified(1), view, createT('hr'), 'hr')).toContain('1 flotu');
    expect(eventText(fortified(3), view, createT('hr'), 'hr')).toContain('3 flote');
    expect(eventText(fortified(11), view, createT('hr'), 'hr')).toContain('11 flota');
    expect(eventText(fortified(1), view, createT('en'), 'en')).toContain('1 fleet ');
  });

  it('names a stolen card only when the event carries it', () => {
    const t = createT('en');
    expect(eventText(SAMPLES.stolen[0]!, view, t, 'en')).toBe(
      'Pilot 1 steals a card from Pilot 2: Metal',
    );
    expect(eventText(SAMPLES.stolen[1]!, view, t, 'en')).toBe('Pilot 1 steals a card from Pilot 2');
  });

  it('shows unknown players by id instead of throwing', () => {
    const t = createT('en');
    expect(eventText({ type: 'turnStarted', player: 'ghost', round: 1 }, view, t, 'en')).toContain(
      'ghost',
    );
  });
});

describe('battleVariant', () => {
  it('conquered wins over everything', () => {
    expect(battleVariant(battle({ conquered: true, defenderLosses: 0, attackerLosses: 3 }))).toBe(
      'conquered',
    );
  });

  it('won when the defender lost more fleets, otherwise lost', () => {
    expect(battleVariant(battle({ attackerLosses: 0, defenderLosses: 1 }))).toBe('won');
    expect(battleVariant(battle({ attackerLosses: 1, defenderLosses: 1 }))).toBe('lost');
    expect(battleVariant(battle({ attackerLosses: 2, defenderLosses: 0 }))).toBe('lost');
  });

  it('picks the matching battle message', () => {
    const t = createT('en');
    expect(eventText(SAMPLES.battle[0]!, view, t, 'en')).toContain('wins the fight');
    expect(eventText(SAMPLES.battle[1]!, view, t, 'en')).toContain('holds');
    expect(eventText(SAMPLES.battle[2]!, view, t, 'en')).toContain('conquers');
  });
});

describe('home sector names', () => {
  it('put the owner through the dictionary in both languages', () => {
    const home = view.players[0]!.homeId;
    const event: GameEvent = { type: 'pirateMoved', player: 'p2', to: home };
    expect(eventText(event, view, createT('en'), 'en')).toContain('Home system (Pilot 1)');
    expect(eventText(event, view, createT('hr'), 'hr')).toContain('Matični sustav (Pilot 1)');
  });
});
