import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useT } from '../i18n/useT.ts';
import { Button } from './Button.tsx';

function Fallback() {
  const t = useT();
  return (
    <div className="screen" role="alert">
      <p>{t('common.somethingWrong')}</p>
      <Button variant="primary" onClick={() => window.location.reload()}>
        {t('common.reload')}
      </Button>
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  override render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}
