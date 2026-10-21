import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { attackWinChance, conquestChance } from '@starhold/bots';
import { createT } from '@starhold/i18n';
import type { GameEvent, GameState, PlayerId } from '@starhold/engine';
import { AttackDialog } from '../src/game/dialogs/AttackDialog.tsx';
import { DiscardDialog } from '../src/game/dialogs/DiscardDialog.tsx';
import { HomeBonusPicker } from '../src/game/dialogs/HomeBonusPicker.tsx';
import { MoveDialog } from '../src/game/dialogs/MoveDialog.tsx';
import { OfferPanel } from '../src/game/dialogs/OfferPanel.tsx';
import { PirateHint } from '../src/game/dialogs/PirateHint.tsx';
import { TradeDialog } from '../src/game/dialogs/TradeDialog.tsx';
import { bindSocket, useGameStore } from '../src/store/gameStore.ts';
import { FakeSocket } from './fakeSocket.ts';
import {
  bag,
  inPhase,
  sentOnce,
  makeState,
  patchSector,
  pushEvents,
  pushState,
  seedGame,
  withBag,
} from './fixtures.ts';

const t = createT('en');
const FROM = '1,-3';
const TO = '1,-2';

/** p1 (6 fleets) on 1,-3 next to p2 (2 fleets) on 1,-2; p1's turn in the main phase. */
function combat(): GameState {
  let s = inPhase(makeState(3, 1), 'MAIN', 0);
  s = patchSector(s, FROM, { owner: 'p1', fleets: 6 });
  return patchSector(s, TO, { owner: 'p2', fleets: 2 });
}

function liveView() {
  const game = useGameStore.getState().game;
  if (game === null) throw new Error('no game');
  return game.view;
}

/** Re-renders when the store's game changes, like GameScreen does. */
function Live({ children }: { children: (view: ReturnType<typeof liveView>) => React.ReactNode }) {
  const game = useGameStore((s) => s.game);
  return <>{game && children(game.view)}</>;
}

function pct(n: number): string {
  return String(Math.round(n * 100));
}

function battle(over: Partial<Extract<GameEvent, { type: 'battle' }>> = {}): GameEvent {
  return {
    type: 'battle',
    attacker: 'p1',
    defender: 'p2',
    from: FROM,
    to: TO,
    attackRoll: [6, 4],
    defendRoll: [5],
    attackerLosses: 0,
    defenderLosses: 1,
    conquered: false,
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ ...useGameStore.getInitialState(), locale: 'en' }, true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('HomeBonusPicker', () => {
  it('sends chooseHomeBonus for the clicked resource', async () => {
    const { sendAction } = seedGame(makeState(3, 1), 'p1');
    render(<Live>{(view) => <HomeBonusPicker view={view} me="p1" />}</Live>);
    expect(screen.getByText(t('game.homeBonusTitle'))).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(4);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Crystal' }));
    sentOnce(sendAction).toEqual({
      type: 'chooseHomeBonus',
      resource: 'crystal',
    });
  });

  it('renders nothing when it is not my home bonus', () => {
    seedGame(makeState(3, 1), 'p2');
    const { container } = render(<HomeBonusPicker view={liveView()} me="p2" />);
    expect(container.textContent).toBe('');
  });
});

describe('PirateHint', () => {
  it('shows the hint to the player who moves the pirate, and only then', () => {
    seedGame(inPhase(makeState(3, 1), 'PIRATE', 0), 'p1');
    const { rerender } = render(<PirateHint view={liveView()} me="p1" />);
    expect(screen.getByText(t('game.pirateHint'))).toBeTruthy();
    seedGame(inPhase(makeState(3, 1), 'PIRATE', 0), 'p2');
    rerender(<PirateHint view={liveView()} me="p2" />);
    expect(screen.queryByText(t('game.pirateHint'))).toBeNull();
    seedGame(inPhase(makeState(3, 1), 'MAIN', 0), 'p1');
    rerender(<PirateHint view={liveView()} me="p1" />);
    expect(screen.queryByText(t('game.pirateHint'))).toBeNull();
  });
});

describe('DiscardDialog', () => {
  function discarding(pending = 3): GameState {
    const s = withBag(inPhase(makeState(3, 1), 'DISCARD', 0), 'p1', bag(4, 3, 1, 0));
    return { ...s, pendingDiscards: { p1: pending } };
  }

  function group(name: string): HTMLElement {
    return screen.getByRole('group', { name });
  }

  const more = (resource: string) => screen.getByRole('button', { name: `More: ${resource}` });
  const less = (resource: string) => screen.getByRole('button', { name: `Fewer: ${resource}` });
  const confirm = () =>
    screen.getByRole('button', { name: t('game.confirm') }) as HTMLButtonElement;

  it('keeps confirm disabled until exactly the required number is chosen', async () => {
    const { sendAction } = seedGame(discarding(), 'p1');
    const user = userEvent.setup();
    render(<DiscardDialog view={liveView()} me="p1" deadline={null} />);
    expect(screen.getByRole('dialog', { name: t('game.discardTitle') })).toBeTruthy();
    expect(screen.getByText(t('game.discardHint', { count: 3 }))).toBeTruthy();
    expect(confirm().disabled).toBe(true);
    await user.click(more('Metal'));
    await user.click(more('Metal'));
    expect(screen.getByText(t('game.discardChosen', { chosen: 2, count: 3 }))).toBeTruthy();
    expect(confirm().disabled).toBe(true);
    await user.click(more('Energy'));
    expect(confirm().disabled).toBe(false);
    await user.click(confirm());
    sentOnce(sendAction).toEqual({
      type: 'discard',
      resources: bag(2, 1, 0, 0),
    });
  });

  it('cannot choose more than the hand holds or more than required', async () => {
    seedGame(discarding(), 'p1');
    const user = userEvent.setup();
    render(<DiscardDialog view={liveView()} me="p1" deadline={null} />);
    expect((more('Biomass') as HTMLButtonElement).disabled).toBe(true); // holds none
    await user.click(more('Crystal'));
    expect((more('Crystal') as HTMLButtonElement).disabled).toBe(true); // holds one
    await user.click(more('Metal'));
    await user.click(more('Metal'));
    expect(confirm().disabled).toBe(false);
    expect((more('Energy') as HTMLButtonElement).disabled).toBe(true); // required reached
    await user.click(less('Metal'));
    expect(confirm().disabled).toBe(true);
    expect(within(group('Metal')).getByText('1')).toBeTruthy();
  });

  it('counts down to the discard deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    seedGame(discarding(), 'p1');
    render(<DiscardDialog view={liveView()} me="p1" deadline={Date.now() + 25_000} />);
    expect(screen.getByText(t('game.timerValue', { seconds: 25 }))).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText(t('game.timerValue', { seconds: 20 }))).toBeTruthy();
  });

  it('is not dismissible and renders nothing when nothing is owed', async () => {
    seedGame(discarding(), 'p1');
    const { rerender } = render(<DiscardDialog view={liveView()} me="p1" deadline={null} />);
    await userEvent.setup().keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('common.close') })).toBeNull();
    seedGame(discarding(0), 'p1');
    rerender(<DiscardDialog view={liveView()} me="p1" deadline={null} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('MoveDialog', () => {
  function slider(): HTMLInputElement {
    return screen.getByLabelText(t('game.moveCount')) as HTMLInputElement;
  }

  it('expands with a count defaulting to the maximum', async () => {
    const { sendAction } = seedGame(
      inPhase(patchSector(makeState(3, 1), FROM, { owner: 'p1', fleets: 5 }), 'MAIN', 0),
      'p1',
    );
    const onClose = vi.fn();
    render(<MoveDialog view={liveView()} mode="expand" from={FROM} to="0,-2" onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: t('game.expand') })).toBeTruthy();
    expect(slider().min).toBe('1');
    expect(slider().max).toBe('4');
    expect(slider().value).toBe('4');
    expect(screen.queryByText(t('game.fortifyEnds'))).toBeNull();
    fireEvent.change(slider(), { target: { value: '2' } });
    await userEvent.setup().click(screen.getByRole('button', { name: t('game.confirm') }));
    sentOnce(sendAction).toEqual({
      type: 'expand',
      from: FROM,
      to: '0,-2',
      count: 2,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fortify notes that it ends the turn and sends fortify', async () => {
    let s = inPhase(makeState(3, 1), 'MAIN', 0);
    s = patchSector(s, FROM, { owner: 'p1', fleets: 3 });
    const { sendAction } = seedGame(s, 'p1');
    render(
      <MoveDialog
        view={liveView()}
        mode="fortify"
        from={FROM}
        to="2,-3"
        onClose={() => undefined}
      />,
    );
    expect(screen.getByRole('dialog', { name: t('game.fortify') })).toBeTruthy();
    expect(screen.getByText(t('game.fortifyEnds'))).toBeTruthy();
    expect(slider().value).toBe('2');
    await userEvent.setup().click(screen.getByRole('button', { name: t('game.confirm') }));
    sentOnce(sendAction).toEqual({
      type: 'fortify',
      from: FROM,
      to: '2,-3',
      count: 2,
    });
  });
});

describe('AttackDialog', () => {
  function open(onClose = vi.fn()) {
    const seeded = seedGame(combat(), 'p1');
    render(
      <Live>
        {(view) => <AttackDialog view={view} me="p1" from={FROM} to={TO} onClose={onClose} />}
      </Live>,
    );
    return { ...seeded, onClose };
  }

  const slider = () => screen.getByLabelText(t('game.attack.moveOnConquest')) as HTMLInputElement;
  const dieButton = (n: number) =>
    within(screen.getByRole('group', { name: t('game.dice') })).getByRole('button', {
      name: String(n),
    });

  it('headlines the chance to capture and shows the per-round chance below it', async () => {
    open();
    expect(
      screen.getByText(
        t('game.attack.captureChance', { percent: pct(conquestChance(6, 2, false)) }),
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        t('game.attack.roundChance', { percent: pct(attackWinChance(3, 2, false)) }),
      ),
    ).toBeTruthy();
    await userEvent.setup().click(dieButton(2));
    expect(
      screen.getByText(
        t('game.attack.roundChance', { percent: pct(attackWinChance(2, 2, false)) }),
      ),
    ).toBeTruthy();
  });

  it('counts a defending starbase in the chances', () => {
    seedGame(patchSector(combat(), TO, { structure: 'starbase' }), 'p1');
    render(
      <AttackDialog view={liveView()} me="p1" from={FROM} to={TO} onClose={() => undefined} />,
    );
    expect(
      screen.getByText(
        t('game.attack.captureChance', { percent: pct(conquestChance(6, 2, true)) }),
      ),
    ).toBeTruthy();
  });

  it('defaults to the most dice and the most fleets, and offers 1..max dice', () => {
    open();
    expect(dieButton(3).getAttribute('aria-pressed')).toBe('true');
    expect(
      within(screen.getByRole('group', { name: t('game.dice') })).getAllByRole('button'),
    ).toHaveLength(3);
    expect(slider().value).toBe('5');
    expect(slider().max).toBe('5');
    expect(slider().min).toBe('3'); // at least the dice used move in
  });

  it('sends the chosen dice and move count', async () => {
    const { sendAction } = open();
    const user = userEvent.setup();
    await user.click(dieButton(2));
    expect(dieButton(2).getAttribute('aria-pressed')).toBe('true');
    expect(dieButton(3).getAttribute('aria-pressed')).toBe('false');
    fireEvent.change(slider(), { target: { value: '3' } });
    await user.click(screen.getByRole('button', { name: t('game.attack') }));
    sentOnce(sendAction).toEqual({
      type: 'attack',
      from: FROM,
      to: TO,
      dice: 2,
      moveIfConquered: 3,
    });
    expect(screen.getByText(t('game.attack.waiting'))).toBeTruthy();
  });

  it('shows the rolled dice and losses from the matching battle event', async () => {
    open();
    await userEvent.setup().click(screen.getByRole('button', { name: t('game.attack') }));
    act(() => pushEvents(battle({ attackRoll: [6, 4], defendRoll: [5], defenderLosses: 1 })));
    const mine = within(screen.getByRole('group', { name: t('game.attack.attackerDice') }));
    expect(mine.getByText('6')).toBeTruthy();
    expect(mine.getByText('4')).toBeTruthy();
    expect(
      within(screen.getByRole('group', { name: t('game.attack.defenderDice') })).getByText('5'),
    ).toBeTruthy();
    expect(
      screen.getByText(t('game.attack.losses', { attackerLosses: 0, defenderLosses: 1 })),
    ).toBeTruthy();
    expect(screen.getByText(t('game.attack.result.won'))).toBeTruthy();
    expect(screen.queryByText(t('game.attack.waiting'))).toBeNull();
  });

  it('ignores battles logged before the click or fought elsewhere', async () => {
    seedGame(combat(), 'p1', { log: [battle({ defendRoll: [1] })] });
    render(
      <AttackDialog view={liveView()} me="p1" from={FROM} to={TO} onClose={() => undefined} />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: t('game.attack') }));
    expect(screen.getByText(t('game.attack.waiting'))).toBeTruthy();
    act(() => pushEvents(battle({ to: '2,-2', defendRoll: [2] }), battle({ attacker: 'p2' })));
    expect(screen.getByText(t('game.attack.waiting'))).toBeTruthy();
  });

  it('reports a conquest, and offers another attack only after a hold', async () => {
    const { sendAction } = open();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t('game.attack') }));
    act(() => pushEvents(battle({ attackerLosses: 1, defenderLosses: 1 })));
    expect(screen.getByText(t('game.attack.result.lost'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t('game.attack.again') }));
    // back to the setup form; a second attack uses a fresh result
    await user.click(screen.getByRole('button', { name: t('game.attack') }));
    expect(sendAction).toHaveBeenCalledTimes(2);
    expect(screen.getByText(t('game.attack.waiting'))).toBeTruthy();
    act(() => pushEvents(battle({ conquered: true, defenderLosses: 2 })));
    expect(screen.getByText(t('game.attack.result.conquered'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('game.attack.again') })).toBeNull();
  });

  it('returns to the setup form with the error when the server rejects the attack', async () => {
    const { sendAction } = open();
    const fake = new FakeSocket();
    bindSocket(fake.asSocket());
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t('game.attack') }));
    expect(screen.getByText(t('game.attack.waiting'))).toBeTruthy();
    act(() => fake.trigger('error', { code: 'err.invalidDice' }));
    expect(screen.queryByText(t('game.attack.waiting'))).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe(t('err.invalidDice'));
    // the form works again
    await user.click(screen.getByRole('button', { name: t('game.attack') }));
    expect(sendAction).toHaveBeenCalledTimes(2);
    expect(screen.getByText(t('game.attack.waiting'))).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is not fooled by an error from before the attack was sent', async () => {
    open();
    const fake = new FakeSocket();
    bindSocket(fake.asSocket());
    act(() => fake.trigger('error', { code: 'err.rateLimited' }));
    await userEvent.setup().click(screen.getByRole('button', { name: t('game.attack') }));
    expect(screen.getByText(t('game.attack.waiting'))).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a battle result wins over a later error', async () => {
    open();
    const fake = new FakeSocket();
    bindSocket(fake.asSocket());
    await userEvent.setup().click(screen.getByRole('button', { name: t('game.attack') }));
    act(() => pushEvents(battle()));
    act(() => fake.trigger('error', { code: 'err.rateLimited' }));
    expect(screen.getByText(t('game.attack.result.won'))).toBeTruthy();
  });

  it('moves focus to the status region after sending and again after a result', async () => {
    open();
    await userEvent.setup().click(screen.getByRole('button', { name: t('game.attack') }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.textContent).toContain(t('game.attack.waiting'));
    act(() => pushEvents(battle()));
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.textContent).toContain(t('game.attack.result.won'));
  });

  it('keeps working when the game state moves on underneath it', async () => {
    open();
    await userEvent.setup().click(screen.getByRole('button', { name: t('game.attack') }));
    act(() => pushState(patchSector(combat(), FROM, { owner: 'p1', fleets: 4 }), 'p1'));
    act(() => pushEvents(battle()));
    expect(screen.getByText(t('game.attack.result.won'))).toBeTruthy();
  });

  it('closes through the close button', async () => {
    const { onClose } = open();
    await userEvent.setup().click(screen.getByRole('button', { name: t('common.close') }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('TradeDialog', () => {
  const user = () => userEvent.setup();

  function stateWith(hand = bag(4, 1, 0, 0)): GameState {
    return withBag(inPhase(makeState(3, 1), 'MAIN', 0), 'p1', hand);
  }

  function renderTrade(tab: 'bank' | 'players' = 'bank', state = stateWith()) {
    const seeded = seedGame(state, 'p1');
    const onClose = vi.fn();
    render(
      <Live>
        {(view) => <TradeDialog view={view} me="p1" initialTab={tab} onClose={onClose} />}
      </Live>,
    );
    return { ...seeded, onClose };
  }

  const side = (label: string) => screen.getByRole('group', { name: label });

  it('shows the bank rate and trades four of a kind for one card', async () => {
    const { sendAction } = renderTrade();
    expect(screen.getByRole('dialog', { name: t('game.trade.title') })).toBeTruthy();
    expect(screen.getByText(t('game.rate', { rate: 4 }))).toBeTruthy();
    const confirm = () =>
      screen.getByRole('button', { name: t('game.confirm') }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    const u = user();
    await u.click(within(side(t('game.give'))).getByRole('button', { name: 'Metal' }));
    await u.click(within(side(t('game.want'))).getByRole('button', { name: 'Crystal' }));
    expect(confirm().disabled).toBe(false);
    await u.click(confirm());
    sentOnce(sendAction).toEqual({
      type: 'bankTrade',
      give: 'metal',
      get: 'crystal',
    });
  });

  it('disables resources you cannot afford to give and the one already given on the other side', async () => {
    renderTrade();
    const give = within(side(t('game.give')));
    expect((give.getByRole('button', { name: 'Energy' }) as HTMLButtonElement).disabled).toBe(true);
    expect((give.getByRole('button', { name: 'Metal' }) as HTMLButtonElement).disabled).toBe(false);
    await user().click(give.getByRole('button', { name: 'Metal' }));
    expect(
      (within(side(t('game.want'))).getByRole('button', { name: 'Metal' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('shows the 3:1 rate with a trade station', () => {
    const s = patchSector(stateWith(bag(3)), '-1,-1', { owner: 'p1', fleets: 1 });
    renderTrade('bank', s);
    expect(screen.getByText(t('game.rate', { rate: 3 }))).toBeTruthy();
  });

  it('builds a player offer with steppers and sends offerTrade', async () => {
    const { sendAction } = renderTrade('players', stateWith(bag(2, 1, 1, 0)));
    const u = user();
    const send = () =>
      screen.getByRole('button', { name: t('game.trade.send') }) as HTMLButtonElement;
    expect(send().disabled).toBe(true);
    const give = within(side(t('game.give')));
    const want = within(side(t('game.want')));
    await u.click(give.getByRole('button', { name: 'More: Metal' }));
    expect(send().disabled).toBe(true); // nothing asked for yet
    await u.click(want.getByRole('button', { name: 'More: Energy' }));
    await u.click(want.getByRole('button', { name: 'More: Energy' }));
    expect(send().disabled).toBe(false);
    await u.click(send());
    sentOnce(sendAction).toEqual({
      type: 'offerTrade',
      give: bag(1),
      want: bag(0, 2),
    });
  });

  it('cannot offer more than the hand holds, and never the same resource on both sides', async () => {
    renderTrade('players', stateWith(bag(1, 1, 1, 1)));
    const u = user();
    const give = within(side(t('game.give')));
    const want = within(side(t('game.want')));
    await u.click(give.getByRole('button', { name: 'More: Metal' }));
    expect((give.getByRole('button', { name: 'More: Metal' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await u.click(want.getByRole('button', { name: 'More: Metal' }));
    expect(
      within(within(side(t('game.give'))).getByRole('group', { name: 'Metal' })).getByText('0'),
    ).toBeTruthy();
    expect(
      within(within(side(t('game.want'))).getByRole('group', { name: 'Metal' })).getByText('1'),
    ).toBeTruthy();
  });

  it('switches between the bank and player tabs', async () => {
    renderTrade('bank');
    const u = user();
    const players = screen.getByRole('tab', { name: t('game.trade.players') });
    expect(players.getAttribute('aria-selected')).toBe('false');
    await u.click(players);
    expect(players.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: t('game.trade.send') })).toBeTruthy();
    await u.click(screen.getByRole('tab', { name: t('game.bankTrade') }));
    expect(screen.getByText(t('game.rate', { rate: 4 }))).toBeTruthy();
  });

  it('closes after sending an offer', async () => {
    const { onClose } = renderTrade('players', stateWith(bag(1, 1, 1, 1)));
    const u = user();
    await u.click(within(side(t('game.give'))).getByRole('button', { name: 'More: Metal' }));
    await u.click(within(side(t('game.want'))).getByRole('button', { name: 'More: Energy' }));
    await u.click(screen.getByRole('button', { name: t('game.trade.send') }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('OfferPanel', () => {
  function withOffer(
    over: Partial<NonNullable<GameState['offer']>> = {},
    hand = bag(1, 1, 1, 1),
  ): GameState {
    return {
      ...withBag(inPhase(makeState(3, 1), 'MAIN', 0), 'p2', hand),
      offer: { from: 'p1', give: bag(1), want: bag(0, 1), accepted: [], declined: [], ...over },
    };
  }

  function panelFor(me: PlayerId, state: GameState) {
    const seeded = seedGame(state, me);
    render(<Live>{(view) => <OfferPanel view={view} me={me} />}</Live>);
    return seeded;
  }

  it('renders nothing without an open offer', () => {
    seedGame(inPhase(makeState(3, 1), 'MAIN', 0), 'p2');
    const { container } = render(<OfferPanel view={liveView()} me="p2" />);
    expect(container.textContent).toBe('');
  });

  it('shows Accept and Decline to a player who is not the offerer', async () => {
    const { sendAction } = panelFor('p2', withOffer());
    expect(
      screen.getByText(
        t('game.offer.incoming', { player: 'Pilot 1', give: '1 Metal', want: '1 Energy' }),
      ),
    ).toBeTruthy();
    const accept = screen.getByRole('button', { name: t('game.accept') }) as HTMLButtonElement;
    const decline = screen.getByRole('button', { name: t('game.decline') }) as HTMLButtonElement;
    expect(accept.disabled).toBe(false);
    const u = userEvent.setup();
    await u.click(accept);
    expect(sendAction).toHaveBeenLastCalledWith({ type: 'respondTrade', accept: true });
    await u.click(decline);
    expect(sendAction).toHaveBeenLastCalledWith({ type: 'respondTrade', accept: false });
  });

  it('explains why Accept is missing when the hand is too small', () => {
    panelFor('p2', withOffer({ want: bag(0, 3) }));
    expect(screen.queryByRole('button', { name: t('game.accept') })).toBeNull();
    expect(screen.getByText(t('game.offer.cannotAfford'))).toBeTruthy();
    expect(screen.getByRole('button', { name: t('game.decline') })).toBeTruthy();
  });

  it('shows my earlier answer instead of the buttons', () => {
    panelFor('p2', withOffer({ accepted: ['p2'] }));
    expect(screen.getByText(t('game.offer.youAccepted'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('game.accept') })).toBeNull();
  });

  it('shows the offerer who answered what, with a confirm button per acceptor', async () => {
    const { sendAction } = panelFor(
      'p1',
      withOffer({ accepted: ['p2'], declined: ['p3'] }, bag(1, 1, 1, 1)),
    );
    expect(
      screen.getByText(t('game.offer.yours', { give: '1 Metal', want: '1 Energy' })),
    ).toBeTruthy();
    expect(
      screen.getByText(
        t('game.offer.status', { player: 'Pilot 2', status: t('game.offer.accepted') }),
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        t('game.offer.status', { player: 'Pilot 3', status: t('game.offer.declined') }),
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('game.accept') })).toBeNull();
    const u = userEvent.setup();
    await u.click(
      screen.getByRole('button', { name: t('game.offer.tradeWith', { player: 'Pilot 2' }) }),
    );
    expect(sendAction).toHaveBeenLastCalledWith({ type: 'confirmTrade', with: 'p2' });
    await u.click(screen.getByRole('button', { name: t('game.offer.withdraw') }));
    expect(sendAction).toHaveBeenLastCalledWith({ type: 'cancelTrade' });
  });

  it('lists players who have not answered yet as waiting', () => {
    panelFor('p1', withOffer());
    expect(
      screen.getByText(
        t('game.offer.status', { player: 'Pilot 2', status: t('game.offer.pending') }),
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        t('game.offer.status', { player: 'Pilot 3', status: t('game.offer.pending') }),
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Trade with/ })).toBeNull();
  });
});
