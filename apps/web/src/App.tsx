import { useT } from './i18n/useT.ts';
import { AppRoutes } from './routes.tsx';
import { useGameStore } from './store/gameStore.ts';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';
import { Toasts } from './ui/Toasts.tsx';

function ConnectionBanner() {
  const t = useT();
  const connection = useGameStore((s) => s.connection);
  if (connection === 'online') return null;
  return (
    <div className="connection-banner" role="status">
      {t('game.reconnecting')}
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <ConnectionBanner />
      <AppRoutes />
      <Toasts />
    </ErrorBoundary>
  );
}
