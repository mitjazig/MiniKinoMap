import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { DebugPage } from '../pages/DebugPage';
import { DevicePage } from '../pages/DevicePage';
import { HistoryDetailPage } from '../pages/HistoryDetailPage';
import { HistoryPage } from '../pages/HistoryPage';
import { HomePage } from '../pages/HomePage';
import { RoutesPage } from '../pages/RoutesPage';
import { SettingsPage } from '../pages/SettingsPage';
import { WorkoutPage } from '../pages/WorkoutPage';
import { YouTubeRouteFormPage } from '../pages/YouTubeRouteFormPage';

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route path="/routes/new" element={<YouTubeRouteFormPage />} />
          <Route path="/routes/:routeId/edit" element={<YouTubeRouteFormPage />} />
          <Route path="/device" element={<DevicePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:id" element={<HistoryDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/debug" element={<DebugPage />} />
        </Route>
        <Route path="/workout/:routeId" element={<WorkoutPage />} />
      </Routes>
    </BrowserRouter>
  );
}
