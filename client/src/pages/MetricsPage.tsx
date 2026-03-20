import { StatCard } from '../components/StatCard';
import { currency, number } from '../lib/format';
import type { PerformanceMetrics } from '../types/trade';

export function MetricsPage({ metrics }: { metrics: PerformanceMetrics | null }) {
  const safeMetrics = metrics ?? {
    totalRealizedPnL: 0,
    totalUnrealizedPnL: 0,
    winRate: 0,
    profitFactor: 0,
    averageWin: 0,
    averageLoss: 0
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatCard title="Total Realized P&L" value={currency(safeMetrics.totalRealizedPnL)} />
      <StatCard title="Total Unrealized P&L" value={currency(safeMetrics.totalUnrealizedPnL)} />
      <StatCard title="Win Rate" value={`${number(safeMetrics.winRate * 100)}%`} />
      <StatCard title="Profit Factor" value={number(safeMetrics.profitFactor)} />
      <StatCard title="Average Win" value={currency(safeMetrics.averageWin)} />
      <StatCard title="Average Loss" value={currency(safeMetrics.averageLoss)} />
    </div>
  );
}
