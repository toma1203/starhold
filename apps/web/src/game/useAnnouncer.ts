import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '@starhold/engine';
import { useT } from '../i18n/useT.ts';
import { useGameStore } from '../store/gameStore.ts';
import { eventText } from './eventText.ts';

/** At most one change of the live region per window, so a run of bot turns cannot flood it. */
export const ANNOUNCE_THROTTLE_MS = 2000;

/** Appended to every second announcement. */
const NBSP = String.fromCharCode(0xa0);

interface Pending {
  turn?: string;
  battle?: string;
}

/**
 * The text for the screen-reader live region: "your turn" when the turn passes to me and the
 * result of every battle I am part of. Within the throttle window only the newest message of each
 * kind is kept. Nothing is announced for what is already on screen when the board mounts.
 */
export function useAnnouncer(view: PlayerView, me: string): string {
  const t = useT();
  const locale = useGameStore((s) => s.locale);
  const log = useGameStore((s) => s.log);
  const [text, setText] = useState('');

  const myTurn = view.players[view.current]?.id === me && view.phase !== 'FINISHED';
  const lastTurn = useRef(myTurn);
  const lastLogId = useRef(log.at(-1)?.id ?? 0);
  const lastAt = useRef(0);
  const pending = useRef<Pending>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flip = useRef(false);

  const flush = () => {
    timer.current = null;
    const { turn, battle } = pending.current;
    pending.current = {};
    const message = [turn, battle].filter(Boolean).join(' ');
    if (message === '') return;
    lastAt.current = Date.now();
    // A trailing no-break space makes an identical repeat a changed text, which is announced again.
    flip.current = !flip.current;
    setText(flip.current ? message : message + NBSP);
  };

  const announce = (kind: keyof Pending, message: string) => {
    pending.current[kind] = message;
    if (timer.current !== null) return;
    const wait = lastAt.current + ANNOUNCE_THROTTLE_MS - Date.now();
    if (wait <= 0) flush();
    else timer.current = setTimeout(flush, wait);
  };

  useEffect(() => {
    if (myTurn && !lastTurn.current) announce('turn', t('game.yourTurn'));
    lastTurn.current = myTurn;
    // Runs only when the turn changes hands.
  }, [myTurn]);

  useEffect(() => {
    const fresh = log.filter((entry) => entry.id > lastLogId.current);
    lastLogId.current = log.at(-1)?.id ?? lastLogId.current;
    for (const { event } of fresh) {
      if (event.type === 'battle' && (event.attacker === me || event.defender === me)) {
        announce('battle', eventText(event, view, t, locale));
      }
    }
    // Runs only when the log grows.
  }, [log]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return text;
}
