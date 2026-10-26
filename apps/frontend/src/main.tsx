import { MotionProvider } from './components/motion-preference';
import { NotificationProvider } from './components/notifications';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/app';
import './styles.css';
import './styles/vis004.css';
import './styles/vis0041.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz da aplicação não encontrado.');

createRoot(root).render(
  <StrictMode>
    <MotionProvider>
      <NotificationProvider>
        <App />
      </NotificationProvider>
    </MotionProvider>
  </StrictMode>,
);
