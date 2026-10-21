import { useId } from 'react';
import { COSTS, bagTotal, hasAtLeast } from '@starhold/engine';
import type { Action, PlayerId, PlayerView, SectorId } from '@starhold/engine';
import type { MessageKey } from '@starhold/i18n';
import { useT } from '../i18n/useT.ts';
import { useGameStore } from '../store/gameStore.ts';
import { Button } from '../ui/Button.tsx';
import type { TradeTab } from './dialogs/TradeDialog.tsx';
import { bagText } from './format.ts';
import { legalActionsFor } from './legalCache.ts';

type BuildKind = 'fleet' | 'colony' | 'starbase';

const BUILDS: {
  kind: BuildKind;
  type: 'buildFleet' | 'buildColony' | 'buildStarbase';
  label: MessageKey;
}[] = [
  { kind: 'fleet', type: 'buildFleet', label: 'game.buildFleet' },
  { kind: 'colony', type: 'buildColony', label: 'game.buildColony' },
  { kind: 'starbase', type: 'buildStarbase', label: 'game.buildStarbase' },
];

const SITE_REASON: Partial<Record<BuildKind, MessageKey>> = {
  colony: 'game.reason.colonySite',
  starbase: 'game.reason.starbaseSite',
};

export interface ActionBarProps {
  view: PlayerView;
  me: PlayerId;
  selected: SectorId | null;
  onTrade: (tab: TradeTab) => void;
}

/** A button that, while disabled, can say why (tooltip plus a hidden description for screen readers). */
function ReasonButton({
  reason,
  disabled,
  children,
  ...rest
}: {
  reason: string | null;
  disabled: boolean;
  children: React.ReactNode;
  variant?: 'primary';
  onClick: () => void;
}) {
  const id = useId();
  const why = disabled ? reason : null;
  return (
    <>
      <Button
        {...rest}
        disabled={disabled}
        title={why ?? undefined}
        aria-describedby={why === null ? undefined : id}
      >
        {children}
      </Button>
      {why !== null && (
        <span id={id} className="sr-only">
          {why}
        </span>
      )}
    </>
  );
}

/** What the viewer can do now: roll or end the turn, trade, and build on the selected sector. */
export function ActionBar({ view, me, selected, onTrade }: ActionBarProps) {
  const t = useT();
  const sendAction = useGameStore((s) => s.sendAction);
  const current = view.players[view.current];
  const myTurn = current?.id === me;
  const actions = legalActionsFor(view, me);
  const can = (type: Action['type']) => actions.some((a) => a.type === type);
  const hand = view.players.find((p) => p.id === me)?.resources ?? null;
  const inMain = view.phase === 'MAIN';
  const site = selected === null ? undefined : view.sectors[selected];
  const ownSite = site?.owner === me ? site : undefined;
  const noFunds = t('err.insufficientResources');

  const buildReason = (kind: BuildKind): string | null => {
    if (!myTurn) return null;
    if (hand && !hasAtLeast(hand, COSTS[kind])) return noFunds;
    const key = SITE_REASON[kind];
    return key ? t(key) : null;
  };

  return (
    <div className="action-bar">
      <p className="turn-status">
        {myTurn || !current ? t('game.yourTurn') : t('game.waitingFor', { player: current.name })}
      </p>
      <div className="button-row">
        {view.phase === 'ROLL' && (
          <ReasonButton
            variant="primary"
            reason={null}
            disabled={!can('roll')}
            onClick={() => sendAction({ type: 'roll' })}
          >
            {t('game.roll')}
          </ReasonButton>
        )}
        {inMain && (
          <>
            <ReasonButton
              variant="primary"
              reason={null}
              disabled={!can('endTurn')}
              onClick={() => sendAction({ type: 'endTurn' })}
            >
              {t('game.endTurn')}
            </ReasonButton>
            <ReasonButton
              reason={myTurn ? noFunds : null}
              disabled={!can('bankTrade')}
              onClick={() => onTrade('bank')}
            >
              {t('game.bankTrade')}
            </ReasonButton>
            <ReasonButton
              reason={null}
              disabled={!myTurn || hand === null || bagTotal(hand) < 1}
              onClick={() => onTrade('players')}
            >
              {t('game.offerTrade')}
            </ReasonButton>
          </>
        )}
      </div>
      {inMain && ownSite && (
        <div className="build-row">
          {BUILDS.map(({ kind, type, label }) => (
            <ReasonButton
              key={kind}
              reason={buildReason(kind)}
              disabled={!actions.some((a) => a.type === type && a.at === ownSite.id)}
              onClick={() => sendAction({ type, at: ownSite.id })}
            >
              <span>{t(label)}</span>
              <small className="cost">{bagText(COSTS[kind], t)}</small>
            </ReasonButton>
          ))}
        </div>
      )}
      {inMain && myTurn && !ownSite && <p className="hint">{t('game.selectHint')}</p>}
    </div>
  );
}
