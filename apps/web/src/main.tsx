import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { Provider } from 'react-redux';
import { atlasTheme } from './theme';
import { store } from './atlas/store';
import { App } from './App';
import 'leaflet/dist/leaflet.css';
import './atlas/atlas.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root was not found.');

createRoot(root).render(
  <StrictMode>
    <Provider store={store}>
      <ThemeProvider theme={atlasTheme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </Provider>
  </StrictMode>,
);
