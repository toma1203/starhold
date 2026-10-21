import { useEffect, useId, useRef, useState } from 'react';
import { attackWinChance, conquestChance } from '@starhold/bots';
import { maxAttackDice } from '@starhold/engine';
import type { PlayerId, PlayerView, SectorId } from '@starhold/engine';
import type { MessageKey } from '@starhold/i18n';
import { useT } from '../../i18n/useT.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { battleVariant } from '../eventText.ts';
import type { BattleEvent } from '../eventText.ts';
import { sectorLabel } from '../format.ts';
import { legalActionsFor } from '../legalCache.ts';

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

/** Where the log and the error counter stood when the attack was sent. */
interface Sent {
  log: number;
  error: number;
}

/** The first battle of mine on this route logged after the attack was sent, if any. */
function useBattleAfter(sent: Sent | null, me: PlayerId, from: SectorId, to: SectorId) {
  return useGameStore((s): BattleEvent | null => {
    if (sent === null) return null;
    for (const entry of s.log) {
      const e = entry.event;
      if (
        entry.id > sent.log &&
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

/** A server error that arrived after the attack was sent. */
function useErrorAfter(sent: Sent | null): MessageKey | null {
  return useGameStore((s) =>
    sent !== null && s.lastActionError !== null && s.lastActionError.id > sent.error
      ? s.lastActionError.code
      : null,
  );
}

/**
 * Set up an attack (dice and fleets to move in), send it, then show what was rolled. A rejected
 * attack (a server error before any battle) brings the setup form back with the error.
 */
export function AttackDialog({ view, me, from, to, onClose }: AttackDialogProps) {
  const t = useT();
  const sendAction = useGameStore((s) => s.sendAction);
  const moveId = useId();
  const [dicePick, setDicePick] = useState<number | null>(null); // null = the most
  const [movePick, setMovePick] = useState<number | null>(null); // null = the most
  const [sent, setSent] = useState<Sent | null>(null);
  const result = useBattleAfter(sent, me, from, to);
  const error = useErrorAfter(sent);
  const stage = sent === null ? 'setup' : result ? 'result' : error ? 'rejected' : 'waiting';

  // After a stage change the focused control is gone: move focus to what replaced it.
  const statusBox = useRef<HTMLDivElement>(null);
  const errorLine = useRef<HTMLParagraphElement>(null);
  const sendRow = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    (statusBox.current ?? errorLine.current ?? sendRow.current?.querySelector('button'))?.focus();
  }, [stage]);

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
    const { log, lastActionError } = useGameStore.getState();
    sendAction({ type: 'attack', from, to, dice: dice as 1 | 2 | 3, moveIfConquered: move });
    setSent({ log: log.at(-1)?.id ?? 0, error: lastActionError?.id ?? 0 });
  };

  if (stage === 'waiting' || stage === 'result') {
    const variant = result ? battleVariant(result) : null;
    const again =
      variant !== null &&
      variant !== 'conquered' &&
      legalActionsFor(view, me).some((a) => a.type === 'attack' && a.from === from && a.to === to);
    return (
      <Dialog title={title} onClose={onClose}>
        <div ref={statusBox} tabIndex={-1} className="attack-status">
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
            </>
          )}
        </div>
        {again && (
          <Button
            variant="primary"
            onClick={() => {
              setSent(null);
              setMovePick(null);
            }}
          >
            {t('game.attack.again')}
          </Button>
        )}
      </Dialog>
    );
  }

  return (
    <Dialog title={title} onClose={onClose}>
      {error && (
        <p role="alert" tabIndex={-1} ref={errorLine} className="form-error">
          {t(error)}
        </p>
      )}
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
      <div ref={sendRow} className="button-row">
        <Button variant="primary" onClick={send}>
          {title}
        </Button>
      </div>
    </Dialog>
  );
}
