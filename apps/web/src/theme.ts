import { createTheme } from '@mui/material/styles';

export const atlasTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#191d24',
      paper: '#222832',
    },
    primary: {
      main: '#d6b77a',
    },
    text: {
      primary: '#eee8dc',
      secondary: '#b9b2a6',
    },
  },
  shape: {
    borderRadius: 6,
  },
  typography: {
    fontFamily: '"Segoe UI", system-ui, sans-serif',
  },
});
