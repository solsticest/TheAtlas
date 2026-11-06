import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import { AtlasViewer } from './atlas/AtlasViewer';
import { AdminPage } from './admin/AdminPage';

export function App() {
  return <BrowserRouter>
    <Routes>
      <Route path="/" element={<AtlasViewer />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<Stack alignItems="center" justifyContent="center" sx={{minHeight:'100vh'}}>
        <Typography variant="h5" color="primary.main">Страница не найдена</Typography>
        <Box sx={{mt:2}}><Button component={Link} to="/">Вернуться к карте</Button></Box>
      </Stack>} />
    </Routes>
  </BrowserRouter>;
}
