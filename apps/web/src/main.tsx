import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { createSocket } from './net/socket.ts';
import { bindSocket, useGameStore } from './store/gameStore.ts';
import './styles/tokens.css';
import './styles/app.css';

document.documentElement.lang = useGameStore.getState().locale;
bindSocket(createSocket());

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
