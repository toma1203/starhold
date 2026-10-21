import { useEffect, useRef } from 'react';
import type { PlayerView } from '@starhold/engine';
import { useT } from '../i18n/useT.ts';
import { useGameStore } from '../store/gameStore.ts';
import { eventText } from './eventText.ts';

/** The recent events as plain sentences, oldest first, scrolled to the newest. */
export function EventLog({ view }: { view: PlayerView }) {
  const t = useT();
  const locale = useGameStore((s) => s.locale);
  const log = useGameStore((s) => s.log);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <section className="event-log">
      <h2>{t('game.log')}</h2>
      <div ref={box} className="event-log-box" role="log">
        {log.length === 0 ? (
          <p className="hint">{t('game.logEmpty')}</p>
        ) : (
          <ol>
            {log.map((entry) => (
              <li key={entry.id}>{eventText(entry.event, view, t, locale)}</li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
