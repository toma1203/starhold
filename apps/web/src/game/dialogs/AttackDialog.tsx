import { useId, useState } from 'react';
import { attackWinChance, conquestChance } from '@starhold/bots';
import { legalActions, maxAttackDice } from '@starhold/engine';
import type { PlayerId, PlayerView, SectorId } from '@starhold/engine';
import { useT } from '../../i18n/useT.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { battleVariant } from '../eventText.ts';
import type { BattleEvent } from '../eventText.ts';
import { sectorLabel } from '../format.ts';

export interface AttackDialogProps {
  view: PlayerView;
  me: PlayerId;
  from: SectorId;
  to: SectorId;
  onClose: () => void;
}

const percent = (chance: number): number => Math.round(chance * 100);

function Dice({ label, rolls }: { label: string; rolls: number[] }) {
  return (
    <div role="group" aria-label={label} className="dice-row">
      <span>{label}</span>
      {rolls.map((face, i) => (
        <span key={i} className="die">
          {face}
        </span>
      ))}
    </div>
  );
}

/** The newest battle of mine on this route logged after entry `after`, if any. */
function useBattleAfter(after: number | null, me: PlayerId, from: SectorId, to: SectorId) {
  return useGameStore((s): BattleEvent | null => {
    if (after === null) return null;
    for (const entry of s.log) {
      const e = entry.event;
      if (
        entry.id > after &&
        e.type === 'battle' &&
        e.attacker === me &&
        e.from === from &&
        e.to === to
      ) {
        return e;
      }
    }
    return null;
  });
}

/** Set up an attack (dice and fleets to move in), send it, then show what was rolled. */
export function AttackDialog({ view, me, from, to, onClose }: AttackDialogProps) {
  const t = useT();
  const sendAction = useGameStore((s) => s.sendAction);
  const moveId = useId();
  const [dicePick, setDicePick] = useState<number | null>(null); // null = the most
  const [movePick, setMovePick] = useState<number | null>(null); // null = the most
  const [sentAfter, setSentAfter] = useState<number | null>(null);
  const result = useBattleAfter(sentAfter, me, from, to);

  const origin = view.sectors[from];
  const target = view.sectors[to];
  if (!origin || !target) return null;

  const maxDice = Math.max(1, maxAttackDice(view, from));
  const dice = Math.min(dicePick ?? maxDice, maxDice);
  const maxMove = Math.max(dice, origin.fleets - 1);
  const move = Math.min(Math.max(movePick ?? maxMove, dice), maxMove);
  const starbase = target.structure === 'starbase';
  const title = t('game.attack');

  const send = () => {
    sendAction({ type: 'attack', from, to, dice: dice as 1 | 2 | 3, moveIfConquered: move });
    setSentAfter(useGameStore.getState().log.at(-1)?.id ?? 0);
  };

  if (sentAfter !== null) {
    const variant = result ? battleVariant(result) : null;
    const again =
      variant !== null &&
      variant !== 'conquered' &&
      legalActions(view, me).some((a) => a.type === 'attack' && a.from === from && a.to === to);
    return (
      <Dialog title={title} onClose={onClose}>
        {result === null || variant === null ? (
          <p role="status">{t('game.attack.waiting')}</p>
        ) : (
          <>
            <Dice label={t('game.attack.attackerDice')} rolls={result.attackRoll} />
            <Dice label={t('game.attack.defenderDice')} rolls={result.defendRoll} />
            <p>
              {t('game.attack.losses', {
                attackerLosses: result.attackerLosses,
                defenderLosses: result.defenderLosses,
              })}
            </p>
            <p role="status" className="battle-result">
              {t(`game.attack.result.${variant}`)}
            </p>
            {again && (
              <Button
                variant="primary"
                onClick={() => {
                  setSentAfter(null);
                  setMovePick(null);
                }}
              >
                {t('game.attack.again')}
              </Button>
            )}
          </>
        )}
      </Dialog>
    );
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <p>{t('game.route', { from: sectorLabel(view, from, t), to: sectorLabel(view, to, t) })}</p>
      <p className="chance">
        {t('game.attack.captureChance', {
          percent: percent(conquestChance(origin.fleets, target.fleets, starbase)),
        })}
      </p>
      <p className="hint">
        {t('game.attack.roundChance', {
          percent: percent(attackWinChance(dice, Math.min(2, target.fleets), starbase)),
        })}
      </p>
      <div role="group" aria-label={t('game.dice')} className="button-row">
        <span className="button-row-label">{t('game.dice')}</span>
        {Array.from({ length: maxDice }, (_, i) => i + 1).map((n) => (
          <Button key={n} aria-pressed={n === dice} onClick={() => setDicePick(n)}>
            {n}
          </Button>
        ))}
      </div>
      <div className="slider-row">
        <label htmlFor={moveId}>{t('game.attack.moveOnConquest')}</label>
        <input
          id={moveId}
          type="range"
          min={dice}
          max={maxMove}
          value={move}
          onChange={(e) => setMovePick(Number(e.target.value))}
        />
        <output htmlFor={moveId}>{move}</output>
      </div>
      <Button variant="primary" onClick={send}>
        {title}
      </Button>
    </Dialog>
  );
}
