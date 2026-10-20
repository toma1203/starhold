import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game.ts';
import { playerById } from '../src/state.ts';
import type { Action, GameState, PlayerId, ResourceBag, TradeOffer } from '../src/types.ts';
import { atPhase, expectErr, expectOk, makeGame, withResources } from './helpers.ts';

const bag = (b: Partial<ResourceBag>): ResourceBag => ({
  metal: 0,
  energy: 0,
  crystal: 0,
  biomass: 0,
  ...b,
});
const idAt = (s: GameState, i: number): PlayerId => (s.players[i] as { id: PlayerId }).id;
const me = (s: GameState): PlayerId => idAt(s, s.current);
const guest = (s: GameState, n: 1 | 2): PlayerId => idAt(s, (s.current + n) % s.players.length);

/** MAIN phase; current player holds 2 metal, guest 1 holds 1 energy + 1 crystal, guest 2 holds nothing. */
function tradeGame(): GameState {
  const s = atPhase(makeGame(), 'MAIN');
  const a = withResources(s, me(s), bag({ metal: 2 }));
  const b = withResources(a, guest(a, 1), bag({ energy: 1, crystal: 1 }));
  return withResources(b, guest(b, 2), bag({}));
}

const offerAction = (give: Partial<ResourceBag>, want: Partial<ResourceBag>): Action => ({
  type: 'offerTrade',
  give: bag(give),
  want: bag(want),
});

/** tradeGame() with an open offer of 1 metal for 1 energy from the current player. */
function withOffer(): GameState {
  const s = tradeGame();
  return expectOk(applyAction(s, me(s), offerAction({ metal: 1 }, { energy: 1 }))).state;
}

describe('offerTrade', () => {
  it('stores the bags and emits tradeOffered', () => {
    const s = tradeGame();
    const { state, events } = expectOk(
      applyAction(s, me(s), offerAction({ metal: 2 }, { energy: 1 })),
    );
    const offer: TradeOffer = {
      from: me(s),
      give: bag({ metal: 2 }),
      want: bag({ energy: 1 }),
      accepted: [],
      declined: [],
    };
    expect(state.offer).toEqual(offer);
    expect(events).toEqual([{ type: 'tradeOffered', offer }]);
  });

  it('does not touch resources or mutate the input', () => {
    const s = tradeGame();
    const snapshot = JSON.stringify(s);
    const { state } = expectOk(applyAction(s, me(s), offerAction({ metal: 2 }, { energy: 1 })));
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(playerById(state, me(s)).resources).toEqual(bag({ metal: 2 }));
  });

  it('replaces an existing offer with fresh response lists', () => {
    const s = withOffer();
    const answered = expectOk(
      applyAction(s, guest(s, 1), { type: 'respondTrade', accept: true }),
    ).state;
    expect(answered.offer?.accepted).toEqual([guest(s, 1)]);
    const { state } = expectOk(
      applyAction(answered, me(s), offerAction({ metal: 2 }, { crystal: 1 })),
    );
    expect(state.offer).toEqual({
      from: me(s),
      give: bag({ metal: 2 }),
      want: bag({ crystal: 1 }),
      accepted: [],
      declined: [],
    });
  });

  it('rejects overlapping resources with err.invalidTrade', () => {
    const s = tradeGame();
    expectErr(applyAction(s, me(s), offerAction({ metal: 1 }, { metal: 1 })), 'err.invalidTrade');
  });

  it('rejects an empty give or want with err.invalidTrade', () => {
    const s = tradeGame();
    expectErr(applyAction(s, me(s), offerAction({}, { energy: 1 })), 'err.invalidTrade');
    expectErr(applyAction(s, me(s), offerAction({ metal: 1 }, {})), 'err.invalidTrade');
  });

  it('rejects negative, fractional, non-numeric, missing or extra bag entries', () => {
    const s = tradeGame();
    const bad: unknown[] = [
      { metal: -1, energy: 0, crystal: 0, biomass: 0 },
      { metal: 1.5, energy: 0, crystal: 0, biomass: 0 },
      { metal: '1', energy: 0, crystal: 0, biomass: 0 },
      { metal: Number.NaN, energy: 0, crystal: 0, biomass: 0 },
      { metal: 1, energy: 0, crystal: 0 },
      { metal: 1, energy: 0, crystal: 0, biomass: 0, gold: 5 },
      null,
    ];
    for (const give of bad) {
      const action = { type: 'offerTrade', give, want: bag({ energy: 1 }) } as unknown as Action;
      expectErr(applyAction(s, me(s), action), 'err.invalidTrade');
    }
    const badWant = { type: 'offerTrade', give: bag({ metal: 1 }), want: 7 } as unknown as Action;
    expectErr(applyAction(s, me(s), badWant), 'err.invalidTrade');
  });

  it('fails when the offerer cannot afford give with err.insufficientResources', () => {
    const s = tradeGame();
    expectErr(
      applyAction(s, me(s), offerAction({ metal: 3 }, { energy: 1 })),
      'err.insufficientResources',
    );
  });

  it('fails outside MAIN and for a non-current player', () => {
    const s = tradeGame();
    expectErr(
      applyAction(atPhase(s, 'ROLL'), me(s), offerAction({ metal: 1 }, { energy: 1 })),
      'err.wrongPhase',
    );
    expectErr(
      applyAction(s, guest(s, 1), offerAction({ metal: 1 }, { energy: 1 })),
      'err.notYourTurn',
    );
  });
});

describe('respondTrade', () => {
  it('records an acceptance and emits tradeResponded', () => {
    const s = withOffer();
    const g = guest(s, 1);
    const { state, events } = expectOk(applyAction(s, g, { type: 'respondTrade', accept: true }));
    expect(state.offer).toMatchObject({ accepted: [g], declined: [] });
    expect(events).toEqual([{ type: 'tradeResponded', player: g, accept: true }]);
  });

  it('records a decline even without the resources', () => {
    const s = withOffer();
    const g = guest(s, 2);
    const { state } = expectOk(applyAction(s, g, { type: 'respondTrade', accept: false }));
    expect(state.offer).toMatchObject({ accepted: [], declined: [g] });
  });

  it('lets a responder change their answer without being in both lists', () => {
    const s = withOffer();
    const g = guest(s, 1);
    const accepted = expectOk(applyAction(s, g, { type: 'respondTrade', accept: true })).state;
    const declined = expectOk(
      applyAction(accepted, g, { type: 'respondTrade', accept: false }),
    ).state;
    expect(declined.offer).toMatchObject({ accepted: [], declined: [g] });
    const again = expectOk(applyAction(declined, g, { type: 'respondTrade', accept: true })).state;
    expect(again.offer).toMatchObject({ accepted: [g], declined: [] });
  });

  it('does not duplicate a repeated answer', () => {
    const s = withOffer();
    const g = guest(s, 1);
    const once = expectOk(applyAction(s, g, { type: 'respondTrade', accept: true })).state;
    const twice = expectOk(applyAction(once, g, { type: 'respondTrade', accept: true })).state;
    expect(twice.offer).toMatchObject({ accepted: [g], declined: [] });
  });

  it('keeps several responders in separate lists', () => {
    const s = withOffer();
    const a = expectOk(applyAction(s, guest(s, 1), { type: 'respondTrade', accept: true })).state;
    const b = expectOk(applyAction(a, guest(s, 2), { type: 'respondTrade', accept: false })).state;
    expect(b.offer).toMatchObject({ accepted: [guest(s, 1)], declined: [guest(s, 2)] });
  });

  it('does not let the offerer respond', () => {
    const s = withOffer();
    expectErr(applyAction(s, me(s), { type: 'respondTrade', accept: true }), 'err.invalidTrade');
  });

  it('rejects accepting without the wanted resources', () => {
    const s = withOffer();
    const snapshot = JSON.stringify(s);
    expectErr(
      applyAction(s, guest(s, 2), { type: 'respondTrade', accept: true }),
      'err.insufficientResources',
    );
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('fails with err.noOffer when there is no offer', () => {
    const s = tradeGame();
    expectErr(applyAction(s, guest(s, 1), { type: 'respondTrade', accept: true }), 'err.noOffer');
  });

  it('fails outside MAIN with err.wrongPhase', () => {
    const s = atPhase(withOffer(), 'PIRATE');
    expectErr(
      applyAction(s, guest(s, 1), { type: 'respondTrade', accept: true }),
      'err.wrongPhase',
    );
  });
});

describe('confirmTrade', () => {
  it('swaps the exact bags, clears the offer and emits traded', () => {
    const s = withOffer();
    const g = guest(s, 1);
    const accepted = expectOk(applyAction(s, g, { type: 'respondTrade', accept: true })).state;
    const { state, events } = expectOk(
      applyAction(accepted, me(s), { type: 'confirmTrade', with: g }),
    );
    expect(playerById(state, me(s)).resources).toEqual(bag({ metal: 1, energy: 1 }));
    expect(playerById(state, g).resources).toEqual(bag({ metal: 1, crystal: 1 }));
    expect(state.offer).toBeNull();
    expect(events).toEqual([
      { type: 'traded', a: me(s), b: g, aGave: bag({ metal: 1 }), bGave: bag({ energy: 1 }) },
    ]);
  });

  it('does not mutate the input state', () => {
    const s = withOffer();
    const g = guest(s, 1);
    const accepted = expectOk(applyAction(s, g, { type: 'respondTrade', accept: true })).state;
    const snapshot = JSON.stringify(accepted);
    expectOk(applyAction(accepted, me(s), { type: 'confirmTrade', with: g }));
    expect(JSON.stringify(accepted)).toBe(snapshot);
  });

  it('rejects a partner who has not accepted with err.invalidTrade', () => {
    const s = withOffer();
    const declined = expectOk(
      applyAction(s, guest(s, 2), { type: 'respondTrade', accept: false }),
    ).state;
    expectErr(
      applyAction(declined, me(s), { type: 'confirmTrade', with: guest(s, 2) }),
      'err.invalidTrade',
    );
    expectErr(
      applyAction(declined, me(s), { type: 'confirmTrade', with: guest(s, 1) }),
      'err.invalidTrade',
    );
  });

  it('fails with err.insufficientResources when the acceptor spent resources meanwhile', () => {
    const s = withOffer();
    const g = guest(s, 1);
    const accepted = expectOk(applyAction(s, g, { type: 'respondTrade', accept: true })).state;
    const spent = withResources(accepted, g, bag({ energy: 0, crystal: 1 }));
    const snapshot = JSON.stringify(spent);
    expectErr(
      applyAction(spent, me(s), { type: 'confirmTrade', with: g }),
      'err.insufficientResources',
    );
    expect(JSON.stringify(spent)).toBe(snapshot);
    expect(spent.offer).not.toBeNull();
  });

  it('fails with err.insufficientResources when the offerer spent resources meanwhile', () => {
    const s = withOffer();
    const g = guest(s, 1);
    const accepted = expectOk(applyAction(s, g, { type: 'respondTrade', accept: true })).state;
    const spent = withResources(accepted, me(s), bag({ metal: 0 }));
    expectErr(
      applyAction(spent, me(s), { type: 'confirmTrade', with: g }),
      'err.insufficientResources',
    );
  });

  it('fails without an offer, outside MAIN, and for a non-offerer', () => {
    const plain = tradeGame();
    expectErr(
      applyAction(plain, me(plain), { type: 'confirmTrade', with: guest(plain, 1) }),
      'err.noOffer',
    );
    const s = withOffer();
    const g = guest(s, 1);
    expectErr(applyAction(s, g, { type: 'confirmTrade', with: g }), 'err.notYourTurn');
    expectErr(
      applyAction(atPhase(s, 'PIRATE'), me(s), { type: 'confirmTrade', with: g }),
      'err.wrongPhase',
    );
  });
});

describe('cancelTrade', () => {
  it('clears the offer and emits tradeCancelled', () => {
    const s = withOffer();
    const { state, events } = expectOk(applyAction(s, me(s), { type: 'cancelTrade' }));
    expect(state.offer).toBeNull();
    expect(events).toEqual([{ type: 'tradeCancelled' }]);
  });

  it('fails without an offer, for a non-offerer, and outside MAIN', () => {
    const plain = tradeGame();
    expectErr(applyAction(plain, me(plain), { type: 'cancelTrade' }), 'err.noOffer');
    const s = withOffer();
    expectErr(applyAction(s, guest(s, 1), { type: 'cancelTrade' }), 'err.notYourTurn');
    expectErr(applyAction(atPhase(s, 'PIRATE'), me(s), { type: 'cancelTrade' }), 'err.wrongPhase');
  });
});

describe('offer lifecycle', () => {
  it('is cleared when the turn ends', () => {
    const s = withOffer();
    expect(s.offer).not.toBeNull();
    const { state } = expectOk(applyAction(s, me(s), { type: 'endTurn' }));
    expect(state.offer).toBeNull();
  });
});
