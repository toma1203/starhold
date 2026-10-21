import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'wouter';
import { useT } from '../i18n/useT.ts';
import { loadNickname, saveNickname } from '../net/session.ts';
import { useGameStore } from '../store/gameStore.ts';
import { Button } from '../ui/Button.tsx';

/** Shown for /room/:code when this browser holds no seat in that room. */
export function JoinPrompt({ code }: { code: string }) {
  const t = useT();
  const joinRoom = useGameStore((s) => s.joinRoom);
  const [nickname, setNickname] = useState(loadNickname);
  const [busy, setBusy] = useState(false);
  const name = nickname.trim();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (name === '' || busy) return;
    setBusy(true);
    saveNickname(name);
    try {
      await joinRoom(code, name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen">
      <h1>{t('lobby.room', { code })}</h1>
      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        <label className="field">
          <span>{t('home.nickname')}</span>
          <input
            value={nickname}
            maxLength={20}
            autoComplete="nickname"
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>
        <Button type="submit" variant="primary" disabled={name === '' || busy}>
          {t('home.join')}
        </Button>
      </form>
      <Link href="/">{t('common.back')}</Link>
    </main>
  );
}
