import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { devLog } from './utils/logger'

devLog.debug('main.tsx loaded');

const rootElement = document.getElementById('root');
devLog.debug('Root element:', rootElement);

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  devLog.debug('App rendered');
} else {
  console.error('Root element not found!');
}
