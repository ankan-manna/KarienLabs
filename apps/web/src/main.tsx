import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';

import App from './App';
import { queryClient } from './config/query-client';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';

import './styles/index.css';

/** Sonner's `Toaster` has its own `theme` prop and defaults to light
 * regardless of the app's dark mode — this wires it to the same
 * `ThemeContext` everything else uses instead of a second theme source. */
function ThemedToaster() {
  const { theme } = useTheme();
  // `closeButtonAriaLabel` is accepted by this sonner version's types but
  // never actually wired through to the rendered button (upstream gap in
  // 1.7.4) — the button still renders with its own real, specific default
  // label ("Close toast"), so this is left unset rather than passing a prop
  // that silently does nothing.
  //
  // Sonner's built-in close button is a fixed 20x20px, just under the
  // 24x24 minimum touch target — bumped via its own `classNames` override
  // rather than a hand-built button, so the toast layout otherwise stays
  // exactly as shipped.
  return (
    <Toaster
      richColors
      position="top-right"
      theme={theme}
      closeButton
      toastOptions={{ classNames: { closeButton: 'w-6 h-6' } }}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <App />
            <ThemedToaster />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
