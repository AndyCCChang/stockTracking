import { useEffect, useMemo, useState } from 'react';
import { fetchPositions, type PositionItem } from '../lib/api';

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

function sumNullable(values: Array<number | null>) {
  let sum = 0;

  for (const value of values) {
    if (value == null) {
      return null;
    }

    sum += value;
  }

  return sum;
}

function getTone(value: number | null) {
  if (value == null) {
    return 'text-slate-400';
  }

  return value >= 0 ? 'text-emerald-300' : 'text-rose-300';
}

export function PositionsPage() {
  const [items, setItems] = useState<PositionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPositions() {
      try {
        setLoading(true);
        const response = await fetchPositions();
        setItems(response);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load positions');
      } finally {
        setLoading(false);
      }
    }

    void loadPositions();
  }, []);

  const summary = useMemo(() => {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalCostBasis = items.reduce((sum, item) => sum + item.costBasis, 0);
    const totalMarketValue = sumNullable(items.map((item) => item.marketValue));
    const totalUnrealizedPnL = sumNullable(items.map((item) => item.unrealizedPnL));
    const totalLots = items.reduce((sum, item) => sum + item.openLotsCount, 0);

    return {
      totalQuantity,
      totalCostBasis,
      totalMarketValue,
      totalUnrealizedPnL,
      totalLots,
      hasUnavailablePrices: items.some(
        (item) => item.latestPrice == null || item.marketValue == null || item.unrealizedPnL == null
      ),
      totalReturnRate: totalUnrealizedPnL == null ? null : totalCostBasis === 0 ? 0 : totalUnrealizedPnL / totalCostBasis
    };
  }, [items]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Positions</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Open positions are calculated from remaining BUY lots after persisted SELL allocations, with unrealized PnL based on the current price service.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Open Tickers</p>
            <p className="mt-2 text-2xl font-semibold text-white">{items.length}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Open Lots</p>
            <p className="mt-2 text-2xl font-semibold text-white">{summary.totalLots}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Market Value</p>
            <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(summary.totalMarketValue)}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Unrealized PnL</p>
            <p className={`mt-2 text-2xl font-semibold ${getTone(summary.totalUnrealizedPnL)}`}>
              {formatCurrency(summary.totalUnrealizedPnL)}
            </p>
          </article>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      {!error && summary.hasUnavailablePrices ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Some live prices are temporarily unavailable. Affected market value and unrealized fields show N/A.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Shares Open</p>
          <p className="mt-2 text-2xl font-semibold text-white">{summary.totalQuantity.toFixed(2)}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Cost Basis</p>
          <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(summary.totalCostBasis)}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Market Value</p>
          <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(summary.totalMarketValue)}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Net PnL</p>
          <p className={`mt-2 text-2xl font-semibold ${getTone(summary.totalUnrealizedPnL)}`}>
            {formatCurrency(summary.totalUnrealizedPnL)}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Return Rate</p>
          <p className={`mt-2 text-2xl font-semibold ${getTone(summary.totalReturnRate)}`}>
            {formatPercent(summary.totalReturnRate)}
          </p>
        </article>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-white/10 bg-slate-950/40 text-left text-xs uppercase tracking-[0.22em] text-slate-400">
              <tr>
                <th className="px-4 py-3">Ticker</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Avg Cost</th>
                <th className="px-4 py-3">Latest Price</th>
                <th className="px-4 py-3">Cost Basis</th>
                <th className="px-4 py-3">Market Value</th>
                <th className="px-4 py-3">Unrealized</th>
                <th className="px-4 py-3">Return</th>
                <th className="px-4 py-3">Open Lots</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    Loading positions...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    No open positions right now.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.ticker} className="border-b border-white/10 text-slate-200 last:border-b-0">
                    <td className="px-4 py-4 font-medium text-white">{item.ticker}</td>
                    <td className="px-4 py-4">{item.quantity.toFixed(2)}</td>
                    <td className="px-4 py-4">{formatCurrency(item.averageCost, item.currency)}</td>
                    <td className="px-4 py-4">{formatCurrency(item.latestPrice, item.currency)}</td>
                    <td className="px-4 py-4">{formatCurrency(item.costBasis, item.currency)}</td>
                    <td className="px-4 py-4">{formatCurrency(item.marketValue, item.currency)}</td>
                    <td className={`px-4 py-4 font-semibold ${getTone(item.unrealizedPnL)}`}>
                      {formatCurrency(item.unrealizedPnL, item.currency)}
                    </td>
                    <td className={`px-4 py-4 ${getTone(item.unrealizedReturnRate)}`}>
                      {formatPercent(item.unrealizedReturnRate)}
                    </td>
                    <td className="px-4 py-4">{item.openLotsCount}</td>
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
