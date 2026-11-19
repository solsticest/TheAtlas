import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import { AtlasViewer } from './atlas/AtlasViewer';
import { AdminPage } from './admin/AdminPage';
import { ChroniclePage } from './chronicle/ChroniclePage';
import { MythosPage } from './mythos/MythosPage';
import { SiteMenu } from './site/SiteMenu';

export function App() {
  return <BrowserRouter>
    <SiteMenu />
    <Routes>
      <Route path="/" element={<AtlasViewer />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/chronicle" element={<ChroniclePage />} />
      <Route path="/mythos" element={<MythosPage />} />
      <Route path="/bible" element={<MythosPage />} />
      <Route path="*" element={<Stack alignItems="center" justifyContent="center" sx={{minHeight:'100vh'}}>
        <Typography variant="h5" color="primary.main">Страница не найдена</Typography>
        <Box sx={{mt:2}}><Button component={Link} to="/">Вернуться к карте</Button></Box>
      </Stack>} />
    </Routes>
  </BrowserRouter>;
}
