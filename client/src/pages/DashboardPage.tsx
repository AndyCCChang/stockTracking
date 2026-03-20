import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StatCard } from '../components/StatCard';
import { currency, number } from '../lib/format';
import type { PerformanceMetrics, PositionSummary, Trade } from '../types/trade';

export function DashboardPage({ trades, metrics, positions }: { trades: Trade[]; metrics: PerformanceMetrics | null; positions: PositionSummary[] }) {
  const exposure = useMemo(() => positions.reduce((sum, position) => sum + position.marketValue, 0), [positions]);
  const symbols = useMemo(() => new Set(trades.map((trade) => trade.symbol)).size, [trades]);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        <StatCard title="Trades Logged" value={number(trades.length)} />
        <StatCard title="Symbols Traded" value={number(symbols)} />
        <StatCard title="Open Exposure" value={currency(exposure)} />
        <StatCard title="Total Realized P&L" value={currency(metrics?.totalRealizedPnL ?? 0)} />
      </section>
      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-lg font-semibold">Open Position Market Value</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={positions}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="symbol" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="marketValue" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-lg font-semibold">Journal Highlights</h2>
          <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <li>FIFO realized P&L is calculated on every sell.</li>
            <li>Oversells are blocked on create, update, and import.</li>
            <li>Market prices come from a replaceable price service abstraction.</li>
            <li>CSV export/import is available from the trade journal page.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
