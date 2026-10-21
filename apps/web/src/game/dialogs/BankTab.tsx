import { useState } from 'react';
import { RESOURCES, tradeRate } from '@starhold/engine';
import type { PlayerId, PlayerView, Resource } from '@starhold/engine';
import { useT } from '../../i18n/useT.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { Button } from '../../ui/Button.tsx';
import { legalActionsFor } from '../legalCache.ts';
import { ResourceLabel } from '../ResourceLabel.tsx';

function Picker({
  label,
  picked,
  disabled,
  onPick,
}: {
  label: string;
  picked: Resource | null;
  disabled: (r: Resource) => boolean;
  onPick: (r: Resource) => void;
}) {
  return (
    <div role="group" aria-label={label} className="picker">
      <span>{label}</span>
      {RESOURCES.map((r) => (
        <Button
          key={r}
          aria-pressed={picked === r}
          disabled={disabled(r)}
          onClick={() => onPick(r)}
        >
          <ResourceLabel resource={r} />
        </Button>
      ))}
    </div>
  );
}

/** Trade with the bank: pick what to give and what to get; the rate is the player's own. */
export function BankTab({ view, me }: { view: PlayerView; me: PlayerId }) {
  const t = useT();
  const sendAction = useGameStore((s) => s.sendAction);
  const [give, setGive] = useState<Resource | null>(null);
  const [get, setGet] = useState<Resource | null>(null);
  const rate = tradeRate(view, me);
  const actions = legalActionsFor(view, me);
  const affordable = (r: Resource) => actions.some((a) => a.type === 'bankTrade' && a.give === r);
  const legal =
    give !== null &&
    get !== null &&
    actions.some((a) => a.type === 'bankTrade' && a.give === give && a.get === get);

  return (
    <div className="bank-tab">
      <p>{t('game.rate', { rate })}</p>
      <Picker
        label={t('game.give')}
        picked={give}
        disabled={(r) => !affordable(r)}
        onPick={(r) => {
          setGive(r);
          if (get === r) setGet(null);
        }}
      />
      <Picker label={t('game.want')} picked={get} disabled={(r) => r === give} onPick={setGet} />
      <Button
        variant="primary"
        disabled={!legal}
        onClick={() =>
          give !== null && get !== null && sendAction({ type: 'bankTrade', give, get })
        }
      >
        {t('game.confirm')}
      </Button>
    </div>
  );
}
