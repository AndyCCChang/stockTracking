import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';

const DashboardPage = lazy(async () => {
  const module = await import('./pages/DashboardPage');
  return { default: module.DashboardPage };
});

const PerformancePage = lazy(async () => {
  const module = await import('./pages/PerformancePage');
  return { default: module.PerformancePage };
});

const PositionsPage = lazy(async () => {
  const module = await import('./pages/PositionsPage');
  return { default: module.PositionsPage };
});

const RealizedPnLPage = lazy(async () => {
  const module = await import('./pages/RealizedPnLPage');
  return { default: module.RealizedPnLPage };
});

const TradesPage = lazy(async () => {
  const module = await import('./pages/TradesPage');
  return { default: module.TradesPage };
});

const YearlyPerformancePage = lazy(async () => {
  const module = await import('./pages/YearlyPerformancePage');
  return { default: module.YearlyPerformancePage };
});

function RouteFallback() {
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-sm text-slate-300">
      Loading workspace...
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
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
      </Suspense>
    </BrowserRouter>
  );
}
