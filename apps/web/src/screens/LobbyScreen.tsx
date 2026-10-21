import { useId, useRef } from 'react';
import { useLocation } from 'wouter';
import type { BotLevel } from '@starhold/engine';
import type { RoomInfo, RoomSettings } from '@starhold/protocol';
import { useT } from '../i18n/useT.ts';
import { useGameStore } from '../store/gameStore.ts';
import { Button } from '../ui/Button.tsx';
import { PlayerMarker } from '../ui/PlayerMarker.tsx';

const MAX_SEATS = 4;
const MIN_SEATS_TO_START = 2;
const TARGETS = [6, 8, 10] as const;
const TIMERS = [60, 90, 120] as const;
const BOT_LEVELS: readonly BotLevel[] = ['easy', 'normal'];

function SettingsPanel({ room, isHost }: { room: RoomInfo; isHost: boolean }) {
  const t = useT();
  const updateSettings = useGameStore((s) => s.updateSettings);
  const targetId = useId();
  const timerId = useId();
  const { targetVp, turnSeconds } = room.settings;

  if (!isHost) {
    return (
      <dl className="settings">
        <dt>{t('lobby.settingsTarget')}</dt>
        <dd>{targetVp}</dd>
        <dt>{t('lobby.settingsTimer')}</dt>
        <dd>{t('common.seconds', { count: turnSeconds })}</dd>
      </dl>
    );
  }

  const change = (patch: Partial<RoomSettings>) => updateSettings({ ...room.settings, ...patch });
  return (
    <div className="settings">
      <label htmlFor={targetId}>{t('lobby.settingsTarget')}</label>
      <select
        id={targetId}
        value={targetVp}
        onChange={(e) => change({ targetVp: Number(e.target.value) as RoomSettings['targetVp'] })}
      >
        {TARGETS.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      <label htmlFor={timerId}>{t('lobby.settingsTimer')}</label>
      <select
        id={timerId}
        value={turnSeconds}
        onChange={(e) =>
          change({ turnSeconds: Number(e.target.value) as RoomSettings['turnSeconds'] })
        }
      >
        {TIMERS.map((v) => (
          <option key={v} value={v}>
            {t('common.seconds', { count: v })}
          </option>
        ))}
      </select>
    </div>
  );
}

function InviteLink({ code }: { code: string }) {
  const t = useT();
  const pushToast = useGameStore((s) => s.pushToast);
  const input = useRef<HTMLInputElement>(null);
  const url = `${window.location.origin}/room/${code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      pushToast('lobby.linkCopied');
    } catch {
      // No clipboard access: select the visible link so the user can copy it by hand.
      input.current?.focus();
      input.current?.select();
      if (typeof document.execCommand === 'function' && document.execCommand('copy')) {
        pushToast('lobby.linkCopied');
      }
    }
  };

  return (
    <div className="invite">
      <Button variant="primary" onClick={() => void copy()}>
        {t('lobby.copyLink')}
      </Button>
      <input
        ref={input}
        readOnly
        value={url}
        aria-label={t('lobby.inviteLink')}
        onFocus={(e) => e.currentTarget.select()}
      />
    </div>
  );
}

export function LobbyScreen() {
  const t = useT();
  const [, navigate] = useLocation();
  const room = useGameStore((s) => s.room);
  const addBot = useGameStore((s) => s.addBot);
  const removeBot = useGameStore((s) => s.removeBot);
  const startGame = useGameStore((s) => s.startGame);
  const leaveRoom = useGameStore((s) => s.leaveRoom);
  const needPlayersId = useId();
  const playersId = useId();

  if (room === null) return null;
  const isHost = room.hostId === room.you;
  const full = room.seats.length >= MAX_SEATS;
  const canStart = room.seats.length >= MIN_SEATS_TO_START;

  return (
    <main className="screen lobby">
      <header>
        <h1>{t('lobby.room', { code: room.code })}</h1>
        <InviteLink code={room.code} />
      </header>

      <section className="panel">
        <h2 id={playersId}>{t('lobby.players')}</h2>
        <ul className="seats" aria-labelledby={playersId}>
          {room.seats.map((seat, index) => (
            <li key={seat.playerId} className="seat">
              <PlayerMarker seat={index} />
              <span className="seat-name">{seat.name}</span>
              {seat.isBot && (
                <span className="badge">
                  {seat.botLevel === 'easy' ? t('lobby.botEasy') : t('lobby.botNormal')}
                </span>
              )}
              {seat.playerId === room.hostId && <span className="badge">{t('lobby.host')}</span>}
              {seat.playerId === room.you && <span className="badge">{t('lobby.you')}</span>}
              {!seat.isBot &&
                (seat.connected ? (
                  <span className="dot dot-on" aria-hidden="true" />
                ) : (
                  <span className="dot dot-off" role="img" aria-label={t('game.disconnected')} />
                ))}
              {isHost && seat.isBot && (
                <Button
                  variant="ghost"
                  aria-label={`${t('lobby.remove')}: ${seat.name}`}
                  onClick={() => removeBot(seat.playerId)}
                >
                  {t('lobby.remove')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <SettingsPanel room={room} isHost={isHost} />
      </section>

      {isHost ? (
        <section className="panel host-controls">
          <div className="bot-buttons">
            {BOT_LEVELS.map((level) => (
              <Button key={level} disabled={full} onClick={() => addBot(level)}>
                {`${t('lobby.addBot')}: ${level === 'easy' ? t('lobby.botEasy') : t('lobby.botNormal')}`}
              </Button>
            ))}
          </div>
          <Button
            variant="primary"
            disabled={!canStart}
            aria-describedby={canStart ? undefined : needPlayersId}
            onClick={startGame}
          >
            {t('lobby.start')}
          </Button>
          {!canStart && (
            <p id={needPlayersId} className="hint">
              {t('lobby.needPlayers')}
            </p>
          )}
        </section>
      ) : (
        <p className="hint">{t('lobby.waiting')}</p>
      )}

      <Button
        variant="ghost"
        onClick={() => {
          leaveRoom();
          navigate('/');
        }}
      >
        {t('lobby.leave')}
      </Button>
    </main>
  );
}
