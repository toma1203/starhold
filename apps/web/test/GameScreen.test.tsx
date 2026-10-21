import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createT } from '@starhold/i18n';
import type { GameEvent, GameState, SectorId } from '@starhold/engine';
import { ActionBar } from '../src/game/ActionBar.tsx';
import { EventLog } from '../src/game/EventLog.tsx';
import { PlayerList } from '../src/game/PlayerList.tsx';
import { ResourcePanel } from '../src/game/ResourcePanel.tsx';
import { TurnTimer } from '../src/game/TurnTimer.tsx';
import { GameScreen } from '../src/screens/GameScreen.tsx';
import { useGameStore } from '../src/store/gameStore.ts';
import {
  bag,
  inPhase,
  makeState,
  patchSector,
  pushEvents,
  pushState,
  seedGame,
  sentOnce,
  withBag,
} from './fixtures.ts';

const t = createT('en');
const HOME = '2,-3'; // p1's home, 3 fleets
const OWN = '1,-3'; // a sector next to it
const ENEMY = '1,-2'; // next to both
const EMPTY = '2,-2'; // unclaimed, next to HOME

function hex(id: SectorId): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-sector="${id}"]`);
  if (!el) throw new Error(`no hex ${id}`);
  return el;
}

function main(hand = bag(1, 1, 1, 1)): GameState {
  return withBag(inPhase(makeState(3, 1), 'MAIN', 0), 'p1', hand);
}

function enabled(name: string | RegExp): boolean {
  return !(screen.getByRole('button', { name }) as HTMLButtonElement).disabled;
}

function mockMobile(): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ ...useGameStore.getInitialState(), locale: 'en' }, true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('GameScreen', () => {
  it('shows the reconnecting text until a game state arrives', () => {
    render(<GameScreen />);
    expect(screen.getByText(t('game.reconnecting'))).toBeTruthy();
  });

  it('shows the map, the round and the phase', () => {
    seedGame(main(), 'p1');
    render(<GameScreen />);
    expect(screen.getByRole('group', { name: t('map.title') })).toBeTruthy();
    expect(screen.getByText(t('game.round', { round: 1 }))).toBeTruthy();
    expect(screen.getByText(t('game.phase.main'))).toBeTruthy();
  });

  it('shows Roll only for current player in ROLL', async () => {
    const roll = inPhase(makeState(3, 1), 'ROLL', 0);
    const { sendAction } = seedGame(roll, 'p1');
    const first = render(<GameScreen />);
    expect(enabled(t('game.roll'))).toBe(true);
    await userEvent.setup().click(screen.getByRole('button', { name: t('game.roll') }));
    sentOnce(sendAction).toEqual({ type: 'roll' });
    expect(screen.queryByText(t('game.waitingFor', { player: 'Pilot 1' }))).toBeNull();
    first.unmount();

    seedGame(roll, 'p2');
    render(<GameScreen />);
    expect(enabled(t('game.roll'))).toBe(false);
    expect(screen.getByText(t('game.waitingFor', { player: 'Pilot 1' }))).toBeTruthy();
  });

  it('offers the home bonus to the player whose turn it is', async () => {
    const { sendAction } = seedGame(makeState(3, 1), 'p1');
    render(<GameScreen />);
    expect(screen.getByText(t('game.homeBonusTitle'))).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Biomass' }));
    sentOnce(sendAction).toEqual({ type: 'chooseHomeBonus', resource: 'biomass' });
  });

  it('shows the others a waiting message instead of the home bonus', () => {
    seedGame(makeState(3, 1), 'p2');
    render(<GameScreen />);
    expect(screen.queryByText(t('game.homeBonusTitle'))).toBeNull();
    expect(screen.getByText(t('game.waitingFor', { player: 'Pilot 1' }))).toBeTruthy();
  });

  it('ends the turn from the main phase', async () => {
    const { sendAction } = seedGame(main(), 'p1');
    render(<GameScreen />);
    await userEvent.setup().click(screen.getByRole('button', { name: t('game.endTurn') }));
    sentOnce(sendAction).toEqual({ type: 'endTurn' });
  });

  it('build colony button disabled with insufficient resources', async () => {
    const s = patchSector(main(bag(1, 1, 0, 1)), OWN, { owner: 'p1', fleets: 2 });
    const { sendAction } = seedGame(s, 'p1');
    render(<GameScreen />);
    await userEvent.setup().click(hex(OWN));
    const colony = screen.getByRole('button', { name: /Build colony/ }) as HTMLButtonElement;
    expect(colony.disabled).toBe(true);
    expect(colony.title).toBe(t('err.insufficientResources'));
    const fleet = screen.getByRole('button', { name: /Build fleet/ }) as HTMLButtonElement;
    expect(fleet.disabled).toBe(false);
    await userEvent.setup().click(fleet);
    sentOnce(sendAction).toEqual({ type: 'buildFleet', at: OWN });
  });

  it('builds a colony on a selected claimed sector', async () => {
    const s = patchSector(main(), OWN, { owner: 'p1', fleets: 2 });
    const { sendAction } = seedGame(s, 'p1');
    render(<GameScreen />);
    const user = userEvent.setup();
    await user.click(hex(OWN));
    await user.click(screen.getByRole('button', { name: /Build colony/ }));
    sentOnce(sendAction).toEqual({ type: 'buildColony', at: OWN });
  });

  it('expands straight into a free neighbour through the move dialog', async () => {
    const { sendAction } = seedGame(main(), 'p1');
    render(<GameScreen />);
    const user = userEvent.setup();
    await user.click(hex(HOME));
    await user.click(hex(EMPTY));
    expect(screen.getByRole('dialog', { name: t('game.expand') })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t('game.confirm') }));
    sentOnce(sendAction).toEqual({ type: 'expand', from: HOME, to: EMPTY, count: 2 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the attack dialog when clicking an enemy neighbour of the selected sector', async () => {
    let s = patchSector(main(), OWN, { owner: 'p1', fleets: 4 });
    s = patchSector(s, ENEMY, { owner: 'p2', fleets: 2 });
    seedGame(s, 'p1');
    render(<GameScreen />);
    const user = userEvent.setup();
    await user.click(hex(OWN));
    await user.click(hex(ENEMY));
    expect(screen.getByRole('dialog', { name: t('game.attack') })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks what to do when a click means both fortify and build', async () => {
    const s = patchSector(main(), OWN, { owner: 'p1', fleets: 3 });
    const { sendAction } = seedGame(s, 'p1');
    render(<GameScreen />);
    const user = userEvent.setup();
    await user.click(hex(HOME));
    await user.click(hex(OWN));
    const menu = screen.getByRole('group', { name: t('game.chooseAction') });
    expect(within(menu).getAllByRole('button')).toHaveLength(3); // fortify, build, cancel
    await user.click(within(menu).getByRole('button', { name: t('game.fortify') }));
    expect(screen.getByRole('dialog', { name: t('game.fortify') })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t('game.confirm') }));
    sentOnce(sendAction).toEqual({ type: 'fortify', from: HOME, to: OWN, count: 2 });
  });

  it('choosing build in that menu selects the clicked sector for building', async () => {
    const s = patchSector(main(), OWN, { owner: 'p1', fleets: 3 });
    seedGame(s, 'p1');
    render(<GameScreen />);
    const user = userEvent.setup();
    await user.click(hex(HOME));
    await user.click(hex(OWN));
    await user.click(
      within(screen.getByRole('group', { name: t('game.chooseAction') })).getByRole('button', {
        name: t('game.build'),
      }),
    );
    expect(screen.queryByRole('group', { name: t('game.chooseAction') })).toBeNull();
    expect(hex(OWN).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Build fleet/ })).toBeTruthy();
  });

  it('moves the pirate straight away when a sector is clicked in the pirate phase', async () => {
    const { sendAction } = seedGame(inPhase(makeState(3, 1), 'PIRATE', 0), 'p1');
    render(<GameScreen />);
    expect(screen.getByText(t('game.pirateHint'))).toBeTruthy();
    await userEvent.setup().click(hex(EMPTY));
    sentOnce(sendAction).toEqual({ type: 'movePirate', to: EMPTY });
  });

  it('shows the discard dialog only to the player who owes cards', () => {
    const s = {
      ...withBag(inPhase(makeState(3, 1), 'DISCARD', 0), 'p2', bag(4, 4, 0, 0)),
      pendingDiscards: { p2: 4 },
    };
    seedGame(s, 'p2');
    const first = render(<GameScreen />);
    expect(screen.getByRole('dialog', { name: t('game.discardTitle') })).toBeTruthy();
    first.unmount();
    seedGame(s, 'p1');
    render(<GameScreen />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('incoming trade offer shows Accept and Decline to non-offerer', () => {
    const s: GameState = {
      ...main(),
      offer: { from: 'p1', give: bag(1), want: bag(0, 1), accepted: [], declined: [] },
    };
    seedGame(s, 'p2');
    render(<GameScreen />);
    expect(enabled(t('game.accept'))).toBe(true);
    expect(enabled(t('game.decline'))).toBe(true);
  });

  it('opens the trade dialog from the action bar', async () => {
    seedGame(main(bag(4, 0, 0, 0)), 'p1');
    render(<GameScreen />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t('game.bankTrade') }));
    expect(screen.getByRole('dialog', { name: t('game.trade.title') })).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: t('game.bankTrade') }).getAttribute('aria-selected'),
    ).toBe('true');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: t('game.offerTrade') }));
    expect(
      screen.getByRole('tab', { name: t('game.trade.players') }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('keeps the selection when a newer game state arrives', async () => {
    const state = main();
    seedGame(state, 'p1');
    render(<GameScreen />);
    await userEvent.setup().click(hex(HOME));
    expect(hex(HOME).getAttribute('aria-pressed')).toBe('true');
    act(() => pushState(state, 'p1'));
    expect(hex(HOME).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Build fleet/ })).toBeTruthy();
  });

  it('closes an open dialog when the turn passes to somebody else', async () => {
    const state = main(bag(4, 0, 0, 0));
    seedGame(state, 'p1');
    render(<GameScreen />);
    await userEvent.setup().click(screen.getByRole('button', { name: t('game.bankTrade') }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    act(() => pushState(inPhase(state, 'ROLL', 1), 'p1'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('GameScreen layout', () => {
  it('desktop: players and log sit in a sidebar, actions in the bottom bar, no tabs', () => {
    seedGame(main(), 'p1');
    render(<GameScreen />);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('heading', { name: t('game.players') })).toBeTruthy();
    expect(screen.getByRole('heading', { name: t('game.log') })).toBeTruthy();
    expect(screen.getByRole('button', { name: t('game.endTurn') })).toBeTruthy();
  });

  it('mobile: a bottom sheet with Actions, Players and Log tabs', async () => {
    mockMobile();
    seedGame(main(), 'p1', { log: [{ type: 'turnStarted', player: 'p1', round: 1 }] });
    render(<GameScreen />);
    const user = userEvent.setup();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      t('game.actions'),
      t('game.players'),
      t('game.log'),
    ]);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: t('game.endTurn') })).toBeTruthy();
    expect(screen.queryByText(t('game.cards'))).toBeNull();

    await user.click(tabs[1]!);
    expect(screen.getAllByText(t('game.cards'), { selector: 'dt' })).toHaveLength(3);
    expect(screen.queryByRole('button', { name: t('game.endTurn') })).toBeNull();

    await user.click(tabs[2]!);
    expect(screen.getByText("Pilot 1's turn, round 1")).toBeTruthy();
  });

  it('mobile: tapping the open tab collapses and expands the sheet', async () => {
    mockMobile();
    seedGame(main(), 'p1');
    render(<GameScreen />);
    const user = userEvent.setup();
    const actions = screen.getAllByRole('tab')[0]!;
    await user.click(actions);
    expect(screen.queryByRole('button', { name: t('game.endTurn') })).toBeNull();
    expect(actions.getAttribute('aria-expanded')).toBe('false');
    await user.click(actions);
    expect(screen.getByRole('button', { name: t('game.endTurn') })).toBeTruthy();
  });

  it('mobile: prompts stay visible whichever tab is open', async () => {
    mockMobile();
    const s: GameState = {
      ...main(),
      offer: { from: 'p1', give: bag(1), want: bag(0, 1), accepted: [], declined: [] },
    };
    seedGame(s, 'p2');
    render(<GameScreen />);
    await userEvent.setup().click(screen.getAllByRole('tab')[1]!);
    expect(screen.getByRole('button', { name: t('game.accept') })).toBeTruthy();
  });
});

describe('ResourcePanel', () => {
  it('shows each resource with its count', () => {
    render(<ResourcePanel hand={bag(3, 0, 2, 1)} />);
    for (const [name, count] of [
      ['Metal', '3'],
      ['Energy', '0'],
      ['Crystal', '2'],
      ['Biomass', '1'],
    ] as const) {
      const item = screen.getByText(name).closest('li')!;
      expect(within(item).getByText(count)).toBeTruthy();
    }
  });

  it('renders nothing without a hand', () => {
    const { container } = render(<ResourcePanel hand={null} />);
    expect(container.textContent).toBe('');
  });
});

describe('ActionBar', () => {
  function bar(state: GameState, me: string, selected: SectorId | null = null) {
    const seeded = seedGame(state, me);
    const onTrade = vi.fn();
    const view = useGameStore.getState().game!.view;
    render(<ActionBar view={view} me={me} selected={selected} onTrade={onTrade} />);
    return { ...seeded, onTrade };
  }

  it('disables everything and names who is up when it is not my turn', () => {
    bar(main(bag(4, 4, 4, 4)), 'p2');
    expect(screen.getByText(t('game.waitingFor', { player: 'Pilot 1' }))).toBeTruthy();
    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled, button.textContent ?? '').toBe(true);
    }
  });

  it('says it is my turn', () => {
    bar(main(), 'p1');
    expect(screen.getByText(t('game.yourTurn'))).toBeTruthy();
  });

  it('disables bank trade with a reason when no resource reaches the rate', () => {
    bar(main(), 'p1');
    const button = screen.getByRole('button', { name: t('game.bankTrade') }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe(t('err.insufficientResources'));
  });

  it('enables bank trade at four of a kind and opens the right tab', async () => {
    const { onTrade } = bar(main(bag(4, 0, 0, 0)), 'p1');
    expect(enabled(t('game.bankTrade'))).toBe(true);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t('game.bankTrade') }));
    expect(onTrade).toHaveBeenLastCalledWith('bank');
    await user.click(screen.getByRole('button', { name: t('game.offerTrade') }));
    expect(onTrade).toHaveBeenLastCalledWith('players');
  });

  it('cannot offer a trade with an empty hand', () => {
    bar(main(bag(0, 0, 0, 0)), 'p1');
    expect(enabled(t('game.offerTrade'))).toBe(false);
  });

  it('hints at selecting a sector when none is selected', () => {
    bar(main(), 'p1');
    expect(screen.getByText(t('game.selectHint'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Build/ })).toBeNull();
  });

  it('lists the three builds with costs for the selected own sector', () => {
    bar(patchSector(main(bag(3, 1, 2, 0)), OWN, { owner: 'p1', fleets: 2 }), 'p1', OWN);
    expect(screen.getByRole('button', { name: /Build fleet/ }).textContent).toContain(
      '1 Metal, 1 Energy',
    );
    expect(screen.getByRole('button', { name: /Build colony/ }).textContent).toContain(
      '1 Metal, 1 Energy, 1 Crystal, 1 Biomass',
    );
    expect(screen.getByRole('button', { name: /Build starbase/ }).textContent).toContain(
      '3 Metal, 2 Crystal',
    );
  });

  it('explains why a colony or starbase cannot be built here', () => {
    // the home is already a colony: no colony, but it can be upgraded
    bar(main(bag(3, 1, 2, 1)), 'p1', HOME);
    const colony = screen.getByRole('button', { name: /Build colony/ }) as HTMLButtonElement;
    expect(colony.disabled).toBe(true);
    expect(colony.title).toBe(t('game.reason.colonySite'));
    expect(
      (screen.getByRole('button', { name: /Build starbase/ }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('a claimed plain sector cannot take a starbase', () => {
    bar(patchSector(main(bag(3, 1, 2, 1)), OWN, { owner: 'p1', fleets: 2 }), 'p1', OWN);
    const starbase = screen.getByRole('button', { name: /Build starbase/ }) as HTMLButtonElement;
    expect(starbase.disabled).toBe(true);
    expect(starbase.title).toBe(t('game.reason.starbaseSite'));
  });

  it('sends the build for the selected sector', async () => {
    const { sendAction } = bar(main(bag(3, 1, 2, 1)), 'p1', HOME);
    await userEvent.setup().click(screen.getByRole('button', { name: /Build starbase/ }));
    sentOnce(sendAction).toEqual({ type: 'buildStarbase', at: HOME });
  });

  it('shows no build buttons for a sector somebody else owns', () => {
    bar(patchSector(main(), ENEMY, { owner: 'p2', fleets: 2 }), 'p1', ENEMY);
    expect(screen.queryByRole('button', { name: /Build/ })).toBeNull();
  });
});

describe('PlayerList', () => {
  function list(state: GameState, me = 'p1', opts: Parameters<typeof seedGame>[2] = {}) {
    seedGame(state, me, opts);
    const { game, room } = useGameStore.getState();
    render(<PlayerList view={game!.view} seats={room!.seats} />);
  }

  const row = (name: string) => screen.getByText(name).closest('li')!;
  const stat = (r: HTMLElement, label: string) =>
    within(r).getByText(label, { selector: 'dt' }).nextElementSibling!.textContent;

  it('shows marker, VP, cards and fleets per player', () => {
    list(main(), 'p1');
    const mine = row('Pilot 1');
    expect(within(mine).getByTestId('player-marker').getAttribute('data-shape')).toBe('circle');
    expect(stat(mine, t('game.vp'))).toBe('1');
    expect(stat(mine, t('game.cards'))).toBe('4');
    expect(stat(mine, t('game.fleets'))).toBe('3');
    expect(within(mine).getByText(t('lobby.you'))).toBeTruthy();
    expect(within(row('Pilot 2')).queryByText(t('lobby.you'))).toBeNull();
    expect(within(row('Pilot 2')).getByTestId('player-marker').getAttribute('data-shape')).toBe(
      'square',
    );
  });

  it('counts other players cards without seeing them', () => {
    list(main(), 'p1');
    expect(stat(row('Pilot 2'), t('game.cards'))).toBe('4');
  });

  it('highlights whose turn it is', () => {
    list(inPhase(makeState(3, 1), 'MAIN', 1), 'p1');
    expect(row('Pilot 2').getAttribute('aria-current')).toBe('true');
    expect(row('Pilot 1').getAttribute('aria-current')).toBeNull();
  });

  it('shows award badges on the holder', () => {
    const s: GameState = { ...main(), awards: { largestEmpire: 'p2', warlord: 'p3' } };
    list(s);
    expect(within(row('Pilot 2')).getByText(t('game.largestEmpire'))).toBeTruthy();
    expect(within(row('Pilot 3')).getByText(t('game.warlord'))).toBeTruthy();
    expect(within(row('Pilot 1')).queryByText(t('game.largestEmpire'))).toBeNull();
    expect(stat(row('Pilot 2'), t('game.vp'))).toBe('3');
  });

  it('marks away and disconnected players', () => {
    list(main(), 'p1', { afk: ['p2'], offline: ['p3'] });
    expect(within(row('Pilot 2')).getByText(t('game.afk'))).toBeTruthy();
    expect(within(row('Pilot 3')).getByText(t('game.disconnected'))).toBeTruthy();
    expect(within(row('Pilot 1')).queryByText(t('game.afk'))).toBeNull();
  });
});

describe('TurnTimer', () => {
  it('counts the seconds down to the deadline and flags the last ten', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    render(<TurnTimer deadline={Date.now() + 30_000} />);
    const timer = screen.getByRole('timer');
    expect(timer.textContent).toBe(`${t('game.timer')}: ${t('common.seconds', { count: 30 })}`);
    expect(timer.getAttribute('data-warning')).toBe('false');
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(timer.textContent).toContain(t('common.seconds', { count: 10 }));
    expect(timer.getAttribute('data-warning')).toBe('true');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(timer.textContent).toContain(t('common.seconds', { count: 0 }));
  });

  it('renders nothing without a deadline', () => {
    const { container } = render(<TurnTimer deadline={null} />);
    expect(container.textContent).toBe('');
  });

  it('is shown by the game screen when the server sent a deadline', () => {
    seedGame(main(), 'p1', { turnDeadline: Date.now() + 45_000 });
    render(<GameScreen />);
    expect(screen.getByRole('timer')).toBeTruthy();
  });
});

describe('EventLog', () => {
  function log(events: GameEvent[]) {
    seedGame(main(), 'p1', { log: events });
    render(<EventLog view={useGameStore.getState().game!.view} />);
  }

  it('says so when nothing has happened', () => {
    log([]);
    expect(screen.getByText(t('game.logEmpty'))).toBeTruthy();
  });

  it('lists events as localised text, oldest first, and follows new ones', () => {
    log([
      { type: 'turnStarted', player: 'p1', round: 1 },
      { type: 'diceRolled', player: 'p1', dice: [3, 4] },
    ]);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(["Pilot 1's turn, round 1", 'Pilot 1 rolls 3 + 4 = 7']);
    act(() => pushEvents({ type: 'tradeCancelled' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('uses the language of the store', () => {
    seedGame(main(), 'p1', { log: [{ type: 'tradeCancelled' }] });
    useGameStore.setState({ locale: 'hr' });
    render(<EventLog view={useGameStore.getState().game!.view} />);
    expect(screen.getByText(createT('hr')('event.tradeCancelled'))).toBeTruthy();
  });
});
