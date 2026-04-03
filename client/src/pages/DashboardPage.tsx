import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { fetchDashboard, fetchHealth, type DashboardResponse, type HealthResponse } from '../lib/api';

function formatCurrency(value: number | null, currency = 'USD') {
  if (value == null) {
    return 'N/A';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

function formatPercent(value: number | null) {
  if (value == null) {
    return 'N/A';
  }

  return `${(value * 100).toFixed(2)}%`;
}

function getTone(value: number | null, positive = 'text-emerald-300', negative = 'text-rose-300') {
  if (value == null) {
    return 'text-slate-400';
  }

  return value >= 0 ? positive : negative;
}

const emptyDashboard: DashboardResponse = {
  totalCostBasis: 0,
  totalMarketValue: 0,
  totalRealizedPnL: 0,
  totalUnrealizedPnL: 0,
  totalReturnRate: 0,
  currentYearRealizedPnL: 0,
  currentYearUnrealizedPnL: 0,
  openPositionCount: 0,
  cumulativePnLSeries: [],
  unrealizedDistribution: [],
  yearlyOverview: []
};

export function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse>(emptyDashboard);
  const [error, setError] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [healthResponse, dashboardResponse] = await Promise.all([fetchHealth(), fetchDashboard()]);
        setHealth(healthResponse);
        setDashboard(dashboardResponse);
        setError(null);
        setDashboardError(null);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Unable to reach API';
        setError(message);
        setDashboardError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  const hasUnavailablePrices = useMemo(
    () =>
      dashboard.totalMarketValue == null ||
      dashboard.totalUnrealizedPnL == null ||
      dashboard.currentYearUnrealizedPnL == null ||
      dashboard.yearlyOverview.some((item) => item.unrealizedPnL == null),
    [dashboard]
  );

  const summaryCards = useMemo(
    () => [
      { label: 'Market Value', value: formatCurrency(dashboard.totalMarketValue), tone: 'text-white' },
      { label: 'Open Positions', value: String(dashboard.openPositionCount), tone: 'text-emerald-300' },
      { label: 'Total Return', value: formatPercent(dashboard.totalReturnRate), tone: getTone(dashboard.totalReturnRate, 'text-sky-300') },
      {
        label: 'Realized PnL',
        value: formatCurrency(dashboard.totalRealizedPnL),
        tone: dashboard.totalRealizedPnL >= 0 ? 'text-amber-300' : 'text-rose-300'
      }
    ],
    [dashboard]
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <article key={card.label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">{card.label}</p>
            <p className={`mt-3 text-3xl font-semibold ${card.tone}`}>{card.value}</p>
          </article>
        ))}
      </section>

      {dashboardError ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{dashboardError}</div>
      ) : null}

      {!dashboardError && hasUnavailablePrices ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Some live prices are temporarily unavailable, so market-value-based fields may show N/A.
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
        <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Cumulative PnL</h2>
              <p className="text-sm text-slate-400">Realized PnL progression based on persisted sell-to-buy allocations.</p>
            </div>
            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
              {dayjs().format('MMM D, YYYY')}
            </span>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <article className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Cost Basis</p>
              <p className="mt-2 text-xl font-semibold text-white">{formatCurrency(dashboard.totalCostBasis)}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Unrealized PnL</p>
              <p className={`mt-2 text-xl font-semibold ${getTone(dashboard.totalUnrealizedPnL)}`}>
                {formatCurrency(dashboard.totalUnrealizedPnL)}
              </p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Current Year Realized</p>
              <p className={`mt-2 text-xl font-semibold ${dashboard.currentYearRealizedPnL >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {formatCurrency(dashboard.currentYearRealizedPnL)}
              </p>
            </article>
          </div>

          <div className="h-72">
            {loading ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-slate-950/40 text-sm text-slate-400">
                Loading dashboard analytics...
              </div>
            ) : dashboard.cumulativePnLSeries.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-slate-950/40 text-sm text-slate-400">
                No realized PnL history yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dashboard.cumulativePnLSeries}>
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
                  <Line type="monotone" dataKey="value" stroke="#34d399" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">System Status</h2>
          <p className="mt-2 text-sm text-slate-400">Checks the Express API and confirms the production database connection is healthy.</p>

          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">API Health</p>
              <p className="mt-3 text-xl font-semibold text-white">{health?.status === 'ok' ? 'Online' : health?.status === 'degraded' ? 'Degraded' : 'Waiting'}</p>
              <p className="mt-2 text-sm text-slate-400">{error ?? health?.services.message ?? health?.service ?? 'Requesting /api/health ...'}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Database</p>
              <p className="mt-3 text-xl font-semibold text-white">{health?.database ?? 'database-pending'}</p>
              <p className="mt-2 text-sm text-slate-400">
                {health ? `${health.services.databaseDriver} / ${health.services.databaseName ?? 'unavailable'}` : 'Waiting for backend response'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Runtime</p>
              <p className="mt-3 text-xl font-semibold text-white">{health?.runtime.nodeEnv ?? 'pending'}</p>
              <p className="mt-2 text-sm text-slate-400">
                {health ? `Node ${health.runtime.nodeVersion} on port ${health.runtime.port}` : 'Waiting for backend response'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Deploy Config</p>
              <p className="mt-3 text-xl font-semibold text-white">{health?.services.corsConfigured ? 'Ready' : 'Needs Review'}</p>
              <p className="mt-2 text-sm text-slate-400">
                {health ? `CORS ${health.services.corsConfigured ? 'configured' : 'open'} · Price provider ${health.services.priceProvider}` : 'Waiting for backend response'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Unrealized Leaders</p>
              {dashboard.unrealizedDistribution.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">No open positions yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {dashboard.unrealizedDistribution.slice(0, 4).map((item) => (
                    <div key={item.ticker} className="flex items-center justify-between text-sm text-slate-300">
                      <span className="font-medium text-white">{item.ticker}</span>
                      <span className={item.value >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
