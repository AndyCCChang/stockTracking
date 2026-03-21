import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { fetchRealizedTrades, type RealizedTradeItem } from '../lib/api';

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

export function RealizedPnLPage() {
  const [items, setItems] = useState<RealizedTradeItem[]>([]);
  const [expandedIds, setExpandedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRealized() {
      try {
        setLoading(true);
        const response = await fetchRealizedTrades();
        setItems(response);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load realized records');
      } finally {
        setLoading(false);
      }
    }

    void loadRealized();
  }, []);

  const summary = useMemo(() => {
    const totalRealizedPnL = items.reduce((sum, item) => sum + item.realizedPnL, 0);
    const totalClosedQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    return {
      totalRealizedPnL,
      totalClosedQuantity,
      closedTrades: items.length
    };
  }, [items]);

  function toggleExpanded(sellTradeId: number) {
    setExpandedIds((current) =>
      current.includes(sellTradeId) ? current.filter((value) => value !== sellTradeId) : [...current, sellTradeId]
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Realized PnL</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Closed SELL trades are grouped by sell order, and each row can expand to show the exact BUY lots used for allocation.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Closed Trades</p>
            <p className="mt-2 text-2xl font-semibold text-white">{summary.closedTrades}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Closed Quantity</p>
            <p className="mt-2 text-2xl font-semibold text-white">{summary.totalClosedQuantity.toFixed(2)}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Realized PnL</p>
            <p className={`mt-2 text-2xl font-semibold ${summary.totalRealizedPnL >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {formatCurrency(summary.totalRealizedPnL)}
            </p>
          </article>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      <div className="rounded-3xl border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-white/10 bg-slate-950/40 text-left text-xs uppercase tracking-[0.22em] text-slate-400">
              <tr>
                <th className="px-4 py-3">Sell</th>
                <th className="px-4 py-3">Ticker</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Avg Cost</th>
                <th className="px-4 py-3">Sell Price</th>
                <th className="px-4 py-3">Fee</th>
                <th className="px-4 py-3">Realized</th>
                <th className="px-4 py-3">Return</th>
                <th className="px-4 py-3">Lots</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                    Loading realized records...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                    No realized trades yet.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const isExpanded = expandedIds.includes(item.sellTradeId);
                  return (
                    <FragmentRow
                      key={item.sellTradeId}
                      item={item}
                      isExpanded={isExpanded}
                      onToggle={() => toggleExpanded(item.sellTradeId)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

type FragmentRowProps = {
  item: RealizedTradeItem;
  isExpanded: boolean;
  onToggle: () => void;
};

function FragmentRow({ item, isExpanded, onToggle }: FragmentRowProps) {
  return (
    <>
      <tr className="border-b border-white/10 text-slate-200">
        <td className="px-4 py-4">
          <div className="font-medium text-white">#{item.sellTradeId}</div>
          <div className="mt-1 text-xs text-slate-500">{dayjs(item.sellDate).format('YYYY-MM-DD')}</div>
        </td>
        <td className="px-4 py-4 font-medium text-white">{item.ticker}</td>
        <td className="px-4 py-4">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.lotSelectionMethod === 'SPECIFIC' ? 'bg-sky-400/15 text-sky-200' : 'bg-emerald-400/15 text-emerald-200'}`}>
            {item.lotSelectionMethod}
          </span>
        </td>
        <td className="px-4 py-4">{item.quantity.toFixed(2)}</td>
        <td className="px-4 py-4">{formatCurrency(item.averageCost, item.currency)}</td>
        <td className="px-4 py-4">{formatCurrency(item.sellPrice, item.currency)}</td>
        <td className="px-4 py-4">{formatCurrency(item.fee, item.currency)}</td>
        <td className={`px-4 py-4 font-semibold ${item.realizedPnL >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
          {formatCurrency(item.realizedPnL, item.currency)}
        </td>
        <td className="px-4 py-4">{formatPercent(item.returnRate)}</td>
        <td className="px-4 py-4">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-emerald-300/40 hover:text-white"
          >
            {isExpanded ? 'Hide lots' : `View ${item.allocations.length} lots`}
          </button>
        </td>
      </tr>
      {isExpanded ? (
        <tr className="border-b border-white/10 bg-slate-950/35">
          <td colSpan={10} className="px-4 py-4">
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/50">
              <table className="min-w-full text-sm text-slate-300">
                <thead className="border-b border-white/10 text-left text-xs uppercase tracking-[0.22em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Buy Trade</th>
                    <th className="px-4 py-3">Buy Date</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Buy Price</th>
                    <th className="px-4 py-3">Cost Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {item.allocations.map((allocation) => (
                    <tr key={`${item.sellTradeId}-${allocation.buyTradeId}`} className="border-b border-white/5 last:border-b-0">
                      <td className="px-4 py-3">#{allocation.buyTradeId}</td>
                      <td className="px-4 py-3">{allocation.buyTradeDate ? dayjs(allocation.buyTradeDate).format('YYYY-MM-DD') : 'N/A'}</td>
                      <td className="px-4 py-3">{allocation.quantity.toFixed(2)}</td>
                      <td className="px-4 py-3">{allocation.buyPrice == null ? 'N/A' : formatCurrency(allocation.buyPrice, item.currency)}</td>
                      <td className="px-4 py-3">{formatCurrency(allocation.costBasis, item.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
