import { useState } from 'react';
import { bagTotal, emptyBag } from '@starhold/engine';
import type { PlayerId, PlayerView, Resource } from '@starhold/engine';
import { useT } from '../../i18n/useT.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { TurnTimer } from '../TurnTimer.tsx';
import { BagSteppers } from './BagSteppers.tsx';

interface DiscardProps {
  view: PlayerView;
  me: PlayerId;
  deadline: number | null;
}

/** The picks live here, so they start from zero every time this form is mounted. */
function DiscardForm({ view, me, deadline, owed }: DiscardProps & { owed: number }) {
  const t = useT();
  const sendAction = useGameStore((s) => s.sendAction);
  const [chosen, setChosen] = useState(emptyBag);
  const hand = view.players.find((p) => p.id === me)?.resources ?? emptyBag();

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

/** The seven-roll penalty: choose exactly the owed number of cards. Cannot be dismissed. */
export function DiscardDialog(props: DiscardProps) {
  const owed = props.view.pendingDiscards[props.me] ?? 0;
  // Nothing owed unmounts the form, so a later round never inherits old picks.
  return owed > 0 ? <DiscardForm {...props} owed={owed} /> : null;
}
