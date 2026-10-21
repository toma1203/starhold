import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useT } from '../i18n/useT.ts';
import { loadNickname, saveNickname } from '../net/session.ts';
import { useGameStore } from '../store/gameStore.ts';
import { Button } from '../ui/Button.tsx';
import { LanguageSwitch } from '../ui/LanguageSwitch.tsx';

const CODE_LENGTH = 5;

export function HomeScreen() {
  const t = useT();
  const [, navigate] = useLocation();
  const createRoom = useGameStore((s) => s.createRoom);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const [nickname, setNickname] = useState(loadNickname);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const name = nickname.trim();
  const canCreate = name !== '' && !busy;
  const canJoin = name !== '' && code.length === CODE_LENGTH && !busy;

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    saveNickname(name);
    try {
      const target = await action();
      if (target !== null) navigate(`/room/${target}`);
    } finally {
      setBusy(false);
    }
  };

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (canCreate) void run(() => createRoom(name));
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    if (canJoin) void run(async () => ((await joinRoom(code, name)) ? code : null));
  };

  return (
    <main className="screen home">
      <header>
        <h1>{t('home.title')}</h1>
        <p className="tagline">{t('home.tagline')}</p>
      </header>

      <form className="panel" onSubmit={onCreate}>
        <label className="field">
          <span>{t('home.nickname')}</span>
          <input
            value={nickname}
            maxLength={20}
            autoComplete="nickname"
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>
        <Button type="submit" variant="primary" disabled={!canCreate}>
          {t('home.create')}
        </Button>
      </form>

      <form className="panel" onSubmit={onJoin}>
        <label className="field">
          <span>{t('home.code')}</span>
          <input
            value={code}
            maxLength={CODE_LENGTH}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="code-input"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <Button type="submit" disabled={!canJoin}>
          {t('home.join')}
        </Button>
      </form>

      <nav className="footer-nav">
        <Link href="/rules">{t('pages.rules.title')}</Link>
        <Link href="/privacy">{t('pages.privacy.title')}</Link>
        <Link href="/credits">{t('pages.credits.title')}</Link>
        <LanguageSwitch />
      </nav>
    </main>
  );
}
