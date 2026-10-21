import { useState } from 'react';
import { bagTotal, emptyBag } from '@starhold/engine';
import type { PlayerId, PlayerView, Resource, ResourceBag } from '@starhold/engine';
import { useT } from '../../i18n/useT.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { Button } from '../../ui/Button.tsx';
import { BagSteppers } from './BagSteppers.tsx';

const MAX_WANTED = 9;

/** Offer a swap to the other players: two bags, never the same resource on both sides. */
export function OfferTab({
  view,
  me,
  onSent,
}: {
  view: PlayerView;
  me: PlayerId;
  onSent: () => void;
}) {
  const t = useT();
  const sendAction = useGameStore((s) => s.sendAction);
  const [give, setGive] = useState<ResourceBag>(emptyBag);
  const [want, setWant] = useState<ResourceBag>(emptyBag);
  const hand = view.players.find((p) => p.id === me)?.resources ?? emptyBag();

  const stepGive = (r: Resource, delta: 1 | -1) => {
    setGive((g) => ({ ...g, [r]: g[r] + delta }));
    if (delta > 0) setWant((w) => ({ ...w, [r]: 0 }));
  };
  const stepWant = (r: Resource, delta: 1 | -1) => {
    setWant((w) => ({ ...w, [r]: w[r] + delta }));
    if (delta > 0) setGive((g) => ({ ...g, [r]: 0 }));
  };

  return (
    <div className="offer-tab">
      <div role="group" aria-label={t('game.give')}>
        <h3>{t('game.give')}</h3>
        <BagSteppers value={give} canMore={(r) => give[r] < hand[r]} onStep={stepGive} />
      </div>
      <div role="group" aria-label={t('game.want')}>
        <h3>{t('game.want')}</h3>
        <BagSteppers value={want} canMore={(r) => want[r] < MAX_WANTED} onStep={stepWant} />
      </div>
      <Button
        variant="primary"
        disabled={bagTotal(give) < 1 || bagTotal(want) < 1}
        onClick={() => {
          sendAction({ type: 'offerTrade', give, want });
          onSent();
        }}
      >
        {t('game.trade.send')}
      </Button>
    </div>
  );
}
