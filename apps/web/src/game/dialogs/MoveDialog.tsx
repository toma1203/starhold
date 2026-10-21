import { useId, useState } from 'react';
import { maxMovable } from '@starhold/engine';
import type { PlayerView, SectorId } from '@starhold/engine';
import { useT } from '../../i18n/useT.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { sectorLabel } from '../format.ts';

export interface MoveDialogProps {
  view: PlayerView;
  mode: 'expand' | 'fortify';
  from: SectorId;
  to: SectorId;
  onClose: () => void;
}

/** Choose how many fleets to send into a free sector (expand) or to a linked one (fortify). */
export function MoveDialog({ view, mode, from, to, onClose }: MoveDialogProps) {
  const t = useT();
  const sendAction = useGameStore((s) => s.sendAction);
  const sliderId = useId();
  const max = Math.max(1, maxMovable(view, from));
  const [picked, setPicked] = useState<number | null>(null); // null = the maximum
  const count = Math.min(picked ?? max, max);

  const confirm = () => {
    sendAction({ type: mode, from, to, count });
    onClose();
  };

  return (
    <Dialog title={t(mode === 'expand' ? 'game.expand' : 'game.fortify')} onClose={onClose}>
      <p>{t('game.route', { from: sectorLabel(view, from, t), to: sectorLabel(view, to, t) })}</p>
      <div className="slider-row">
        <label htmlFor={sliderId}>{t('game.moveCount')}</label>
        <input
          id={sliderId}
          type="range"
          min={1}
          max={max}
          value={count}
          onChange={(e) => setPicked(Number(e.target.value))}
        />
        <output htmlFor={sliderId}>{count}</output>
      </div>
      {mode === 'fortify' && <p className="hint">{t('game.fortifyEnds')}</p>}
      <Button variant="primary" onClick={confirm}>
        {t('game.confirm')}
      </Button>
    </Dialog>
  );
}
