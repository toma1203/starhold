import { useEffect, useState } from 'react';
import type { Phase, PlayerView, SectorId } from '@starhold/engine';
import type { MessageKey } from '@starhold/i18n';
import type { SeatInfo } from '@starhold/protocol';
import { ActionBar } from '../game/ActionBar.tsx';
import { BottomSheet } from '../game/BottomSheet.tsx';
import { AttackDialog } from '../game/dialogs/AttackDialog.tsx';
import { DiscardDialog } from '../game/dialogs/DiscardDialog.tsx';
import { HomeBonusPicker } from '../game/dialogs/HomeBonusPicker.tsx';
import { MoveDialog } from '../game/dialogs/MoveDialog.tsx';
import { OfferPanel } from '../game/dialogs/OfferPanel.tsx';
import { PirateHint } from '../game/dialogs/PirateHint.tsx';
import { TradeDialog } from '../game/dialogs/TradeDialog.tsx';
import type { TradeTab } from '../game/dialogs/TradeDialog.tsx';
import { EventLog } from '../game/EventLog.tsx';
import { GalaxyMap } from '../game/GalaxyMap.tsx';
import { IntentMenu } from '../game/IntentMenu.tsx';
import type { MenuIntent } from '../game/IntentMenu.tsx';
import { PlayerList } from '../game/PlayerList.tsx';
import { ResourcePanel } from '../game/ResourcePanel.tsx';
import { intentsFor } from '../game/selection.ts';
import { TurnTimer } from '../game/TurnTimer.tsx';
import { useMediaQuery } from '../game/useMediaQuery.ts';
import { useT } from '../i18n/useT.ts';
import { useGameStore } from '../store/gameStore.ts';

const PHASE_LABEL: Record<Phase, MessageKey> = {
  HOME_BONUS: 'game.phase.homeBonus',
  ROLL: 'game.phase.roll',
  DISCARD: 'game.phase.discard',
  PIRATE: 'game.phase.pirate',
  MAIN: 'game.phase.main',
  FINISHED: 'game.phase.finished',
};

type DialogState =
  | { kind: 'attack'; from: SectorId; to: SectorId }
  | { kind: 'move'; mode: 'expand' | 'fortify'; from: SectorId; to: SectorId }
  | { kind: 'trade'; tab: TradeTab };

interface Menu {
  at: SectorId;
  intents: MenuIntent[];
}

interface BoardProps {
  view: PlayerView;
  me: string;
  seats: SeatInfo[];
  version: number;
  turnDeadline: number | null;
  discardDeadline: number | null;
}

function GameBoard({ view, me, seats, version, turnDeadline, discardDeadline }: BoardProps) {
  const t = useT();
  const sendAction = useGameStore((s) => s.sendAction);
  const desktop = useMediaQuery('(min-width: 768px)', true);
  const [selected, setSelected] = useState<SectorId | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);

  const myTurn = view.players[view.current]?.id === me;
  const canAct = myTurn && view.phase === 'MAIN';
  const hand = view.players.find((p) => p.id === me)?.resources ?? null;

  // A menu is a snapshot of one click; any new game state makes it stale.
  useEffect(() => setMenu(null), [version]);
  // Dialogs for actions only make sense on my own turn.
  useEffect(() => {
    if (!canAct) setDialog(null);
  }, [canAct]);

  const choose = (intent: MenuIntent) => {
    setMenu(null);
    if (intent.kind === 'build') setSelected(intent.at);
    else if (intent.kind === 'attack')
      setDialog({ kind: 'attack', from: intent.from, to: intent.to });
    else setDialog({ kind: 'move', mode: intent.kind, from: intent.from, to: intent.to });
  };

  const onSectorClick = (id: SectorId) => {
    setMenu(null);
    const intents = intentsFor(view, me, selected, id);
    const pirate = intents.find((i) => i.kind === 'pirate');
    if (pirate) {
      sendAction({ type: 'movePirate', to: id });
      return;
    }
    const options = intents.filter((i): i is MenuIntent => i.kind !== 'pirate');
    const moves = options.filter((i) => i.kind !== 'build');
    if (moves.length > 0 && options.length === 1) {
      choose(moves[0] as MenuIntent);
    } else if (options.length > 1) {
      setMenu({ at: id, intents: options });
    } else {
      setSelected(view.sectors[id]?.owner === me && selected !== id ? id : null);
    }
  };

  const actions = (
    <>
      <ResourcePanel hand={hand} />
      <ActionBar
        view={view}
        me={me}
        selected={selected}
        onTrade={(tab) => setDialog({ kind: 'trade', tab })}
      />
    </>
  );
  const players = <PlayerList view={view} seats={seats} />;
  const log = <EventLog view={view} />;

  return (
    <div className="game">
      <header className="game-top">
        <span>{t('game.round', { round: view.round })}</span>
        <span className="phase-label">{t(PHASE_LABEL[view.phase])}</span>
        {view.dice && (
          <span>{t('game.lastRoll', { dice: `${view.dice[0]} + ${view.dice[1]}` })}</span>
        )}
        <TurnTimer deadline={turnDeadline} />
      </header>
      <PirateHint view={view} me={me} />
      <div className="game-body">
        <div className="game-map">
          <GalaxyMap view={view} me={me} selected={selected} onSectorClick={onSectorClick} />
          {menu && (
            <IntentMenu intents={menu.intents} onPick={choose} onCancel={() => setMenu(null)} />
          )}
        </div>
        {desktop && (
          <aside className="game-side">
            {players}
            {log}
          </aside>
        )}
      </div>
      <div className="game-bottom">
        <HomeBonusPicker view={view} me={me} />
        <OfferPanel view={view} me={me} />
        {desktop ? (
          <div className="game-bar">{actions}</div>
        ) : (
          <BottomSheet
            tabs={[
              { id: 'actions', label: t('game.actions'), content: actions },
              { id: 'players', label: t('game.players'), content: players },
              { id: 'log', label: t('game.log'), content: log },
            ]}
          />
        )}
      </div>

      <DiscardDialog view={view} me={me} deadline={discardDeadline} />
      {dialog?.kind === 'attack' && (
        <AttackDialog
          view={view}
          me={me}
          from={dialog.from}
          to={dialog.to}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'move' && (
        <MoveDialog
          view={view}
          mode={dialog.mode}
          from={dialog.from}
          to={dialog.to}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'trade' && (
        <TradeDialog view={view} me={me} initialTab={dialog.tab} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

/** The running game: map, players, log, the viewer's hand and everything they can do. */
export function GameScreen() {
  const t = useT();
  const room = useGameStore((s) => s.room);
  const game = useGameStore((s) => s.game);
  if (room === null || game === null) return <p className="screen">{t('game.reconnecting')}</p>;
  return (
    <GameBoard
      view={game.view}
      me={game.view.me ?? room.you}
      seats={room.seats}
      version={game.version}
      turnDeadline={game.turnDeadline}
      discardDeadline={game.discardDeadline}
    />
  );
}
