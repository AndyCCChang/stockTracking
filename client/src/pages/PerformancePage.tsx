import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { fetchPerformance, type PerformanceResponse } from '../lib/api';

function formatCurrency(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2
  }).format(value);
}

const emptyPerformance: PerformanceResponse = {
  winRate: 0,
  totalClosedTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  averageWin: 0,
  averageLoss: 0,
  maxWin: 0,
  maxLoss: 0,
  profitFactor: 0,
  cumulativePnLCurve: []
};

export function PerformancePage() {
  const [performance, setPerformance] = useState<PerformanceResponse>(emptyPerformance);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPerformance() {
      try {
        setLoading(true);
        const response = await fetchPerformance();
        setPerformance(response);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load performance metrics');
      } finally {
        setLoading(false);
      }
    }

    void loadPerformance();
  }, []);

  const summaryCards = useMemo(
    () => [
      { label: 'Win Rate', value: formatPercent(performance.winRate), tone: 'text-emerald-300' },
      { label: 'Closed Trades', value: formatNumber(performance.totalClosedTrades), tone: 'text-white' },
      { label: 'Profit Factor', value: formatNumber(performance.profitFactor), tone: 'text-sky-300' },
      {
        label: 'Max Win',
        value: formatCurrency(performance.maxWin),
        tone: performance.maxWin >= 0 ? 'text-amber-300' : 'text-rose-300'
      }
    ],
    [performance]
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Performance</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Trade-level performance metrics derived from realized allocation records, including win rate, average outcomes, and cumulative PnL progression.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <article key={card.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{card.label}</p>
              <p className={`mt-2 text-2xl font-semibold ${card.tone}`}>{card.value}</p>
            </article>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <article className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Cumulative PnL Curve</h3>
              <p className="mt-1 text-sm text-slate-400">Running realized PnL across closed SELL trades.</p>
            </div>
            <div className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-xs font-medium text-slate-300">
              {loading ? 'Refreshing' : `${performance.cumulativePnLCurve.length} points`}
            </div>
          </div>

          <div className="h-80">
            {loading ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-slate-950/40 text-sm text-slate-400">
                Loading performance chart...
              </div>
            ) : performance.cumulativePnLCurve.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-slate-950/40 text-sm text-slate-400">
                No closed trades yet, so there is no cumulative curve to display.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performance.cumulativePnLCurve}>
                  <defs>
                    <linearGradient id="performanceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.15)" vertical={false} />
                  <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} width={72} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: '#020617',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '16px'
                    }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#34d399" fill="url(#performanceFill)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-lg font-semibold text-white">Outcome Stats</h3>
          <p className="mt-1 text-sm text-slate-400">A quick view of how closed trades are distributed between winners and losers.</p>

          <div className="mt-5 grid gap-3">
            <MetricCard label="Winning Trades" value={formatNumber(performance.winningTrades)} tone="text-emerald-300" />
            <MetricCard label="Losing Trades" value={formatNumber(performance.losingTrades)} tone="text-rose-300" />
            <MetricCard label="Average Win" value={formatCurrency(performance.averageWin)} tone="text-emerald-300" />
            <MetricCard label="Average Loss" value={formatCurrency(performance.averageLoss)} tone="text-rose-300" />
            <MetricCard label="Max Loss" value={formatCurrency(performance.maxLoss)} tone="text-rose-300" />
          </div>
        </article>
      </div>
    </section>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  tone: string;
};

function MetricCard({ label, value, tone }: MetricCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p>
    </article>
  );
}
