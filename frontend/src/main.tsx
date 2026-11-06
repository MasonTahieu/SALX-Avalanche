import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { WalletProvider } from './contexts/WalletContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { warmUpBackend } from './services/serverStatus';
import './index.css';

// Wake a sleeping backend while the first page renders.
warmUpBackend();

// A tab opened before a new deploy still asks for the old page chunks, which
// no longer exist. Reload once to pick up the new build instead of leaving the
// page blank; the timestamp stops a reload loop if the chunk is truly missing.
window.addEventListener('vite:preloadError', event => {
  const KEY = 'salx:chunk-reload-at';
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY)) || 0; } catch { /* storage blocked */ }
  if (Date.now() - last < 10_000) return;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <WalletProvider>
            <App />
          </WalletProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
