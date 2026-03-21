import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { PerformancePage } from './pages/PerformancePage';
import { PositionsPage } from './pages/PositionsPage';
import { RealizedPnLPage } from './pages/RealizedPnLPage';
import { TradesPage } from './pages/TradesPage';
import { YearlyPerformancePage } from './pages/YearlyPerformancePage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="trades" element={<TradesPage />} />
          <Route path="positions" element={<PositionsPage />} />
          <Route path="realized-pnl" element={<RealizedPnLPage />} />
          <Route path="yearly-performance" element={<YearlyPerformancePage />} />
          <Route path="performance" element={<PerformancePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
