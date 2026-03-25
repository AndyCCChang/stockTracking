import { useEffect, useMemo, useState } from 'react';
import {
  deleteTrade,
  fetchPositions,
  fetchTrades,
  updateTrade,
  type PositionItem,
  type TradePayload,
  type TradeRecord
} from '../lib/api';

type EditableLot = {
  id: number;
  ticker: string;
  tradeDate: string;
  quantity: number;
  allocatedQuantity: number;
  availableQuantity: number;
  price: number;
  fee: number;
  notes: string;
  currency: string;
};

type LotFormState = {
  tradeDate: string;
  quantity: string;
  price: string;
  fee: string;
  notes: string;
  currency: string;
};

const QUANTITY_EPSILON = 0.000001;

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

function formatQuantity(value: number) {
  return value.toFixed(2);
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

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildEditableLots(trades: TradeRecord[]) {
  return trades
    .filter((trade) => trade.type === 'BUY')
    .map((trade) => {
      const allocatedQuantity = trade.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
      const availableQuantity = trade.quantity - allocatedQuantity;

      return {
        id: trade.id,
        ticker: trade.ticker,
        tradeDate: trade.tradeDate,
        quantity: trade.quantity,
        allocatedQuantity,
        availableQuantity,
        price: trade.price,
        fee: trade.fee,
        notes: trade.notes ?? '',
        currency: trade.currency
      } satisfies EditableLot;
    })
    .filter((lot) => lot.availableQuantity > QUANTITY_EPSILON)
    .sort((left, right) => left.tradeDate.localeCompare(right.tradeDate) || left.id - right.id);
}

function createLotFormState(lot: EditableLot): LotFormState {
  return {
    tradeDate: lot.tradeDate,
    quantity: String(lot.quantity),
    price: String(lot.price),
    fee: String(lot.fee),
    notes: lot.notes,
    currency: lot.currency
  };
}

export function PositionsPage() {
  const [items, setItems] = useState<PositionItem[]>([]);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [editingLotId, setEditingLotId] = useState<number | null>(null);
  const [lotForm, setLotForm] = useState<LotFormState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [savingLotId, setSavingLotId] = useState<number | null>(null);
  const [deletingLotId, setDeletingLotId] = useState<number | null>(null);

  async function loadData() {
    try {
      setLoading(true);
      const [positionsResponse, tradesResponse] = await Promise.all([fetchPositions(), fetchTrades()]);
      setItems(positionsResponse);
      setTrades(tradesResponse.items);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load positions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const editableLots = useMemo(() => buildEditableLots(trades), [trades]);

  const lotsByTicker = useMemo(() => {
    const result = new Map<string, EditableLot[]>();
    for (const lot of editableLots) {
      const current = result.get(lot.ticker) ?? [];
      current.push(lot);
      result.set(lot.ticker, current);
    }
    return result;
  }, [editableLots]);

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

  function resetLotEditor() {
    setEditingLotId(null);
    setLotForm(null);
  }

  function toggleTicker(ticker: string) {
    setExpandedTicker((current) => (current === ticker ? null : ticker));
    setActionError(null);
    setActionMessage(null);
    resetLotEditor();
  }

  function startEditing(lot: EditableLot) {
    setExpandedTicker(lot.ticker);
    setEditingLotId(lot.id);
    setLotForm(createLotFormState(lot));
    setActionError(null);
    setActionMessage(null);
  }

  async function handleSaveLot(lot: EditableLot) {
    if (!lotForm) {
      return;
    }

    const quantity = toNumber(lotForm.quantity);
    const price = toNumber(lotForm.price);
    const fee = toNumber(lotForm.fee);

    if (lotForm.tradeDate.trim().length === 0) {
      setActionError('Trade date is required.');
      return;
    }

    if (quantity <= 0) {
      setActionError('Quantity must be greater than 0.');
      return;
    }

    if (quantity + QUANTITY_EPSILON < lot.allocatedQuantity) {
      setActionError(`Quantity cannot be lower than the already allocated ${formatQuantity(lot.allocatedQuantity)} shares.`);
      return;
    }

    if (price <= 0) {
      setActionError('Price must be greater than 0.');
      return;
    }

    if (fee < 0) {
      setActionError('Fee cannot be negative.');
      return;
    }

    const payload: TradePayload = {
      ticker: lot.ticker,
      tradeDate: lotForm.tradeDate,
      type: 'BUY',
      quantity,
      price,
      fee,
      notes: lotForm.notes.trim().length === 0 ? null : lotForm.notes.trim(),
      currency: lotForm.currency || lot.currency,
      lotSelectionMethod: 'FIFO'
    };

    try {
      setSavingLotId(lot.id);
      await updateTrade(lot.id, payload);
      setActionError(null);
      setActionMessage(`Updated BUY lot #${lot.id} for ${lot.ticker}.`);
      resetLotEditor();
      await loadData();
      setExpandedTicker(lot.ticker);
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : 'Failed to update lot');
    } finally {
      setSavingLotId(null);
    }
  }

  async function handleDeleteLot(lot: EditableLot) {
    if (lot.allocatedQuantity > QUANTITY_EPSILON) {
      setActionError('Only fully unallocated open lots can be deleted from the Positions page.');
      return;
    }

    try {
      setDeletingLotId(lot.id);
      await deleteTrade(lot.id);
      setActionError(null);
      setActionMessage(`Deleted BUY lot #${lot.id} for ${lot.ticker}.`);
      if (editingLotId === lot.id) {
        resetLotEditor();
      }
      await loadData();
      setExpandedTicker(lot.ticker);
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : 'Failed to delete lot');
    } finally {
      setDeletingLotId(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Positions</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Positions are derived from remaining BUY lots. You can manage those open lots here, and the position summary will refresh after each change.
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
            <p className="mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-semibold leading-tight text-white sm:text-xl xl:text-2xl">{formatCurrency(summary.totalMarketValue)}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Unrealized PnL</p>
            <p className={`mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-semibold leading-tight sm:text-xl xl:text-2xl ${getTone(summary.totalUnrealizedPnL)}`}>
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
          <p className="mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-semibold leading-tight text-white sm:text-xl xl:text-2xl">{formatCurrency(summary.totalCostBasis)}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Market Value</p>
          <p className="mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-semibold leading-tight text-white sm:text-xl xl:text-2xl">{formatCurrency(summary.totalMarketValue)}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Net PnL</p>
          <p className={`mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-semibold leading-tight sm:text-xl xl:text-2xl ${getTone(summary.totalUnrealizedPnL)}`}>
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
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                    Loading positions...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                    No open positions right now.
                  </td>
                </tr>
              ) : (
                items.flatMap((item) => {
                  const lots = lotsByTicker.get(item.ticker) ?? [];
                  const isExpanded = expandedTicker === item.ticker;

                  return [
                    <tr key={item.ticker} className="border-b border-white/10 text-slate-200 last:border-b-0">
                      <td className="px-4 py-4">
                        <div className="font-medium text-white">{item.ticker}</div>
                        <div className="mt-1 text-xs text-slate-400">Current: {formatCurrency(item.latestPrice, item.currency)}</div>
                      </td>
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
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => toggleTicker(item.ticker)}
                          className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-400/20"
                        >
                          {isExpanded ? 'Hide Lots' : 'Manage Lots'}
                        </button>
                      </td>
                    </tr>,
                    isExpanded ? (
                      <tr key={`${item.ticker}-editor`} className="border-b border-white/10 bg-slate-950/20 text-slate-200 last:border-b-0">
                        <td colSpan={10} className="px-4 py-5">
                          <div className="space-y-4">
                            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <h3 className="text-base font-semibold text-white">Manage {item.ticker} Open Lots</h3>
                                <p className="mt-1 text-sm text-slate-400">
                                  Edit the underlying BUY lots that still have open shares. Delete is limited to fully unallocated lots.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                                  {lots.length} lot{lots.length === 1 ? '' : 's'} available
                                </div>
                                <div className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-100">
                                  Current Price: {formatCurrency(item.latestPrice, item.currency)}
                                </div>
                              </div>
                            </div>

                            {actionError ? (
                              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{actionError}</div>
                            ) : null}

                            {actionMessage ? (
                              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{actionMessage}</div>
                            ) : null}

                            {lots.length === 0 ? (
                              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-slate-400">
                                No editable open lots remain for this ticker.
                              </div>
                            ) : (
                              <div className="grid gap-4 xl:grid-cols-2">
                                {lots.map((lot) => {
                                  const isEditing = editingLotId === lot.id && lotForm != null;
                                  const isSaving = savingLotId === lot.id;
                                  const isDeleting = deletingLotId === lot.id;
                                  const deleteDisabled = lot.allocatedQuantity > QUANTITY_EPSILON || isDeleting || isSaving;

                                  return (
                                    <article key={lot.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                          <p className="text-sm font-semibold text-white">BUY Lot #{lot.id}</p>
                                          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">{lot.tradeDate}</p>
                                        </div>
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => startEditing(lot)}
                                            disabled={isSaving || isDeleting}
                                            className="rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1.5 text-xs font-medium text-sky-200 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                                          >
                                            {isEditing ? 'Editing' : 'Edit'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => void handleDeleteLot(lot)}
                                            disabled={deleteDisabled}
                                            className="rounded-full border border-rose-300/30 bg-rose-400/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                                          >
                                            {isDeleting ? 'Deleting...' : 'Delete'}
                                          </button>
                                        </div>
                                      </div>

                                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                                        <Metric label="Total Qty" value={formatQuantity(lot.quantity)} />
                                        <Metric label="Allocated" value={formatQuantity(lot.allocatedQuantity)} />
                                        <Metric label="Open Qty" value={formatQuantity(lot.availableQuantity)} />
                                        <Metric label="Buy Price" value={formatCurrency(lot.price, lot.currency)} />
                                        <Metric label="Current Price" value={formatCurrency(item.latestPrice, item.currency)} />
                                      </div>

                                      {lot.allocatedQuantity > QUANTITY_EPSILON ? (
                                        <p className="mt-3 text-xs text-amber-200">
                                          This lot already has allocated SELL shares, so delete is disabled and quantity cannot be reduced below {formatQuantity(lot.allocatedQuantity)}.
                                        </p>
                                      ) : null}

                                      {isEditing && lotForm ? (
                                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                                          <label className="space-y-2 text-sm text-slate-300">
                                            <span>Trade Date</span>
                                            <input
                                              type="date"
                                              value={lotForm.tradeDate}
                                              onChange={(event) => setLotForm((current) => current ? { ...current, tradeDate: event.target.value } : current)}
                                              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40"
                                            />
                                          </label>
                                          <label className="space-y-2 text-sm text-slate-300">
                                            <span>Quantity</span>
                                            <input
                                              type="number"
                                              min={lot.allocatedQuantity}
                                              step="0.01"
                                              value={lotForm.quantity}
                                              onChange={(event) => setLotForm((current) => current ? { ...current, quantity: event.target.value } : current)}
                                              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40"
                                            />
                                          </label>
                                          <label className="space-y-2 text-sm text-slate-300">
                                            <span>Price</span>
                                            <input
                                              type="number"
                                              min="0"
                                              step="0.01"
                                              value={lotForm.price}
                                              onChange={(event) => setLotForm((current) => current ? { ...current, price: event.target.value } : current)}
                                              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40"
                                            />
                                          </label>
                                          <label className="space-y-2 text-sm text-slate-300">
                                            <span>Fee</span>
                                            <input
                                              type="number"
                                              min="0"
                                              step="0.01"
                                              value={lotForm.fee}
                                              onChange={(event) => setLotForm((current) => current ? { ...current, fee: event.target.value } : current)}
                                              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40"
                                            />
                                          </label>
                                          <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
                                            <span>Notes</span>
                                            <textarea
                                              rows={3}
                                              value={lotForm.notes}
                                              onChange={(event) => setLotForm((current) => current ? { ...current, notes: event.target.value } : current)}
                                              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40"
                                            />
                                          </label>
                                          <div className="md:col-span-2 flex flex-wrap gap-3">
                                            <button
                                              type="button"
                                              onClick={() => void handleSaveLot(lot)}
                                              disabled={isSaving}
                                              className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                                            >
                                              {isSaving ? 'Saving...' : 'Save Lot'}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={resetLotEditor}
                                              disabled={isSaving}
                                              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      ) : null}
                                    </article>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null
                  ];
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

type MetricProps = {
  label: string;
  value: string;
};

function Metric({ label, value }: MetricProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
