import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  fetchMonthlySummary,
  fetchRangePerformance,
  fetchYearlySummary,
  type DateRangePerformanceResponse,
  type MonthlySummaryResponse,
  type YearlyOverviewItem
} from '../lib/api';

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

const emptyMonthlySummary: MonthlySummaryResponse = {
  year: dayjs().format('YYYY'),
  months: []
};

const today = dayjs().format('YYYY-MM-DD');
const currentYearStart = dayjs().startOf('year').format('YYYY-MM-DD');

const emptyRangePerformance: DateRangePerformanceResponse = {
  startDate: currentYearStart,
  endDate: today,
  summary: {
    realizedPnL: 0,
    unrealizedPnL: 0,
    tradeCount: 0,
    buyAmount: 0,
    sellAmount: 0,
    returnRate: 0
  },
  periods: []
};

export function YearlyPerformancePage() {
  const [yearlyItems, setYearlyItems] = useState<YearlyOverviewItem[]>([]);
  const [selectedYear, setSelectedYear] = useState(dayjs().format('YYYY'));
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummaryResponse>(emptyMonthlySummary);
  const [rangeStartDate, setRangeStartDate] = useState(currentYearStart);
  const [rangeEndDate, setRangeEndDate] = useState(today);
  const [rangePerformance, setRangePerformance] = useState<DateRangePerformanceResponse>(emptyRangePerformance);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadYearlySummary() {
      try {
        setLoading(true);
        const [response, rangeResponse] = await Promise.all([
          fetchYearlySummary(),
          fetchRangePerformance(rangeStartDate, rangeEndDate)
        ]);
        setYearlyItems(response);
        setRangePerformance(rangeResponse);
        setError(null);

        if (response.length > 0) {
          const preferredYear = response.some((item) => item.year === selectedYear) ? selectedYear : response[response.length - 1].year;
          setSelectedYear(preferredYear);
          const monthly = await fetchMonthlySummary(preferredYear);
          setMonthlySummary(monthly);
        } else {
          setMonthlySummary({ year: selectedYear, months: [] });
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load yearly performance');
      } finally {
        setLoading(false);
      }
    }

    void loadYearlySummary();
  }, []);

  async function loadRangePerformance() {
    if (dayjs(rangeEndDate).isBefore(dayjs(rangeStartDate))) {
      setError('End date cannot be earlier than start date.');
      return;
    }

    try {
      setLoading(true);
      const response = await fetchRangePerformance(rangeStartDate, rangeEndDate);
      setRangePerformance(response);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load range performance');
    } finally {
      setLoading(false);
    }
  }

  function handleSelectedYearChange(year: string) {
    setSelectedYear(year);
    setRangeStartDate(`${year}-01-01`);
    setRangeEndDate(`${year}-12-31`);
  }

  const hasUnavailablePrices = useMemo(
    () =>
      rangePerformance.summary.unrealizedPnL == null ||
      rangePerformance.periods.some((item) => item.unrealizedPnL == null),
    [rangePerformance.periods, rangePerformance.summary.unrealizedPnL]
  );

  const rangeSummary = rangePerformance.summary;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Yearly Performance</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Review performance for a custom date range. Realized PnL is based on closed allocations in the range; current unrealized PnL is included only when the range includes today.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[160px_170px_170px_auto]">
          <label className="space-y-2 text-sm text-slate-300">
            <span>Quick Year</span>
            <select
              value={selectedYear}
              onChange={(event) => handleSelectedYearChange(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40"
            >
              {yearlyItems.length === 0 ? <option value={selectedYear}>{selectedYear}</option> : null}
              {yearlyItems.map((item) => (
                <option key={item.year} value={item.year}>{item.year}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            <span>Start Date</span>
            <input
              type="date"
              value={rangeStartDate}
              onChange={(event) => setRangeStartDate(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40"
            />
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            <span>End Date</span>
            <input
              type="date"
              value={rangeEndDate}
              onChange={(event) => setRangeEndDate(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void loadRangePerformance()}
              disabled={loading}
              className="w-full rounded-full border border-emerald-300/30 bg-emerald-400/10 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
            >
              {loading ? 'Loading...' : 'Load Range'}
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      {!error && hasUnavailablePrices ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Some current prices are unavailable, so unrealized annual fields may show N/A.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Realized PnL" value={formatCurrency(rangeSummary.realizedPnL)} tone={rangeSummary.realizedPnL >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
        <MetricCard label="Unrealized PnL" value={formatCurrency(rangeSummary.unrealizedPnL)} tone={getTone(rangeSummary.unrealizedPnL)} />
        <MetricCard label="Trades" value={String(rangeSummary.tradeCount)} tone="text-white" />
        <MetricCard label="Return Rate" value={formatPercent(rangeSummary.returnRate)} tone={getTone(rangeSummary.returnRate, 'text-sky-300')} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <article className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Monthly Realized PnL</h3>
              <p className="mt-1 text-sm text-slate-400">Breakdown for {rangePerformance.startDate} to {rangePerformance.endDate}.</p>
            </div>
            <div className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-xs font-medium text-slate-300">
              {loading ? 'Refreshing' : `${rangePerformance.periods.length} periods`}
            </div>
          </div>

          <div className="h-80">
            {loading ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-slate-950/40 text-sm text-slate-400">
                Loading yearly analytics...
              </div>
            ) : rangePerformance.periods.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-slate-950/40 text-sm text-slate-400">
                No performance data available for this range.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rangePerformance.periods}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.15)" vertical={false} />
                  <XAxis dataKey="period" stroke="#94a3b8" tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} width={72} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: '#020617',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '16px'
                    }}
                  />
                  <Bar dataKey="realizedPnL" fill="#34d399" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-lg font-semibold text-white">Range Snapshot</h3>
          <p className="mt-1 text-sm text-slate-400">High-level totals for buy/sell flow and return profile in the selected range.</p>

          <div className="mt-5 grid gap-3">
            <MetricCard label="Gross Buy Amount" value={formatCurrency(rangeSummary.buyAmount)} tone="text-white" />
            <MetricCard label="Gross Sell Amount" value={formatCurrency(rangeSummary.sellAmount)} tone="text-white" />
            <MetricCard label="Current Range" value={`${rangePerformance.startDate} to ${rangePerformance.endDate}`} tone="text-amber-300" />
          </div>
        </article>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-white/10 bg-slate-950/40 text-left text-xs uppercase tracking-[0.22em] text-slate-400">
              <tr>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Trades</th>
                <th className="px-4 py-3">Buy Amount</th>
                <th className="px-4 py-3">Sell Amount</th>
                <th className="px-4 py-3">Realized</th>
                <th className="px-4 py-3">Unrealized</th>
                <th className="px-4 py-3">Return</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">Loading range summary...</td>
                </tr>
              ) : rangePerformance.periods.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">No range summary data yet.</td>
                </tr>
              ) : (
                rangePerformance.periods.map((item) => (
                  <tr key={item.period} className="border-b border-white/10 text-slate-200 last:border-b-0">
                    <td className="px-4 py-4 font-medium text-white">
                      <div>{item.period}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.startDate} to {item.endDate}</div>
                    </td>
                    <td className="px-4 py-4">{item.tradeCount}</td>
                    <td className="px-4 py-4">{formatCurrency(item.buyAmount)}</td>
                    <td className="px-4 py-4">{formatCurrency(item.sellAmount)}</td>
                    <td className={`px-4 py-4 ${item.realizedPnL >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatCurrency(item.realizedPnL)}</td>
                    <td className={`px-4 py-4 ${getTone(item.unrealizedPnL)}`}>{formatCurrency(item.unrealizedPnL)}</td>
                    <td className={`px-4 py-4 ${getTone(item.returnRate, 'text-sky-300')}`}>{formatPercent(item.returnRate)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
    <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p>
    </article>
  );
}
