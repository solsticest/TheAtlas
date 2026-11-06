import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { atlasTheme } from './theme';
import { App } from './App';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element #root was not found.');
}

createRoot(root).render(
  <StrictMode>
    <ThemeProvider theme={atlasTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
);
