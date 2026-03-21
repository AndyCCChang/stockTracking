import { useEffect, useState } from 'react';
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
import { fetchHealth, type HealthResponse } from '../lib/api';

const mockPerformance = [
  { month: 'Jan', value: 102000 },
  { month: 'Feb', value: 104600 },
  { month: 'Mar', value: 103800 },
  { month: 'Apr', value: 108400 },
  { month: 'May', value: 111200 },
  { month: 'Jun', value: 114500 }
];

const summaryCards = [
  { label: 'Total Capital', value: '$114,500', tone: 'text-white' },
  { label: 'Open Positions', value: '8', tone: 'text-emerald-300' },
  { label: 'Win Rate', value: '61.2%', tone: 'text-sky-300' },
  { label: 'Realized PnL', value: '+$9,840', tone: 'text-amber-300' }
];

export function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadHealth() {
      try {
        const response = await fetchHealth();
        setHealth(response);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to reach API');
      }
    }

    void loadHealth();
  }, []);

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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
        <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Portfolio Curve</h2>
              <p className="text-sm text-slate-400">Mock data for the phase-1 dashboard shell.</p>
            </div>
            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
              {dayjs().format('MMM D, YYYY')}
            </span>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockPerformance}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.15)" vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} width={72} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '16px'
                  }}
                />
                <Line type="monotone" dataKey="value" stroke="#34d399" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">System Status</h2>
          <p className="mt-2 text-sm text-slate-400">Checks the Express API and confirms the SQLite layer is initialized.</p>

          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">API Health</p>
              <p className="mt-3 text-xl font-semibold text-white">{health?.status === 'ok' ? 'Online' : 'Waiting'}</p>
              <p className="mt-2 text-sm text-slate-400">{error ?? health?.service ?? 'Requesting /api/health ...'}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Database</p>
              <p className="mt-3 text-xl font-semibold text-white">{health?.database ?? 'sqlite-pending'}</p>
              <p className="mt-2 text-sm text-slate-400">
                {health ? `Last checked ${dayjs(health.timestamp).format('YYYY-MM-DD HH:mm:ss')}` : 'Waiting for backend response'}
              </p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
