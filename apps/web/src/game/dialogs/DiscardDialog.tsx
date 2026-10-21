import { useState } from 'react';
import { bagTotal, emptyBag } from '@starhold/engine';
import type { PlayerId, PlayerView, Resource } from '@starhold/engine';
import { useT } from '../../i18n/useT.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { TurnTimer } from '../TurnTimer.tsx';
import { BagSteppers } from './BagSteppers.tsx';

/** The seven-roll penalty: choose exactly the owed number of cards. Cannot be dismissed. */
export function DiscardDialog({
  view,
  me,
  deadline,
}: {
  view: PlayerView;
  me: PlayerId;
  deadline: number | null;
}) {
  const t = useT();
  const sendAction = useGameStore((s) => s.sendAction);
  const [chosen, setChosen] = useState(emptyBag);
  const owed = view.pendingDiscards[me] ?? 0;
  const hand = view.players.find((p) => p.id === me)?.resources;
  if (owed <= 0 || !hand) return null;

  const total = bagTotal(chosen);
  const step = (resource: Resource, delta: 1 | -1) =>
    setChosen((c) => ({ ...c, [resource]: c[resource] + delta }));

  return (
    <Dialog title={t('game.discardTitle')}>
      <p>{t('game.discardHint', { count: owed })}</p>
      <TurnTimer deadline={deadline} />
      <BagSteppers
        value={chosen}
        canMore={(r) => chosen[r] < hand[r] && total < owed}
        onStep={step}
      />
      <p className="hint">{t('game.discardChosen', { chosen: total, count: owed })}</p>
      <Button
        variant="primary"
        disabled={total !== owed}
        onClick={() => sendAction({ type: 'discard', resources: chosen })}
      >
        {t('game.confirm')}
      </Button>
    </Dialog>
  );
}
