import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  createTrade,
  deleteTrade,
  fetchAvailableLots,
  fetchPositions,
  fetchTrades,
  updateTrade,
  type AvailableLot,
  type LotSelectionMethod,
  type PositionItem,
  type TradePayload,
  type TradeRecord
} from '../lib/api';

type EditableLot = {
  id: number;
  broker: string;
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

type SellFormState = {
  tradeDate: string;
  quantity: string;
  price: string;
  fee: string;
  notes: string;
  currency: string;
  lotSelectionMethod: LotSelectionMethod;
  allocations: Record<number, string>;
};

type PositionSortKey =
  | 'ticker'
  | 'quantity'
  | 'averageCost'
  | 'latestPrice'
  | 'costBasis'
  | 'marketValue'
  | 'unrealizedPnL'
  | 'unrealizedReturnRate'
  | 'todaysPnL'
  | 'openLotsCount';

type SortDirection = 'asc' | 'desc';

type SortState = {
  key: PositionSortKey;
  direction: SortDirection;
};

type CompositionItem = {
  ticker: string;
  value: number;
  quantity: number;
  currency: string;
  share: number;
};

const QUANTITY_EPSILON = 0.000001;
const PRICE_REFRESH_INTERVAL_MS = 120_000;
const PIE_COLORS = ['#34d399', '#38bdf8', '#f59e0b', '#f87171', '#a78bfa', '#facc15', '#fb7185', '#22c55e'];

type PositionSummaryStats = ReturnType<typeof buildPositionSummary>;

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

function normalizeBroker(value: string | null | undefined) {
  const broker = value?.trim();
  return broker && broker.length > 0 ? broker : 'Unassigned';
}

function getPositionKey(item: Pick<PositionItem, 'broker' | 'ticker'>) {
  return `${normalizeBroker(item.broker)}\u0000${item.ticker}`;
}

function getLotKey(lot: Pick<EditableLot, 'broker' | 'ticker'>) {
  return `${normalizeBroker(lot.broker)}\u0000${lot.ticker}`;
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

function buildPositionSummary(sourceItems: PositionItem[]) {
  const totalQuantity = sourceItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalCostBasis = sourceItems.reduce((sum, item) => sum + item.costBasis, 0);
  const totalMarketValue = sumNullable(sourceItems.map((item) => item.marketValue));
  const totalUnrealizedPnL = sumNullable(sourceItems.map((item) => item.unrealizedPnL));
  const totalTodaysPnL = sumNullable(sourceItems.map((item) => item.todaysPnL));
  const totalLots = sourceItems.reduce((sum, item) => sum + item.openLotsCount, 0);

  return {
    totalQuantity,
    totalCostBasis,
    totalMarketValue,
    totalUnrealizedPnL,
    totalTodaysPnL,
    totalLots,
    hasUnavailablePrices: sourceItems.some(
      (item) => item.latestPrice == null || item.marketValue == null || item.unrealizedPnL == null || item.todaysPnL == null
    ),
    totalReturnRate: totalUnrealizedPnL == null ? null : totalCostBasis === 0 ? 0 : totalUnrealizedPnL / totalCostBasis
  };
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

function renderSortIndicator(active: boolean, direction: SortDirection) {
  if (!active) {
    return ' <>';
  }

  return direction === 'asc' ? ' ^' : ' v';
}

function buildEditableLots(trades: TradeRecord[]) {
  return trades
    .filter((trade) => trade.type === 'BUY')
    .map((trade) => {
      const allocatedQuantity = trade.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
      const availableQuantity = trade.quantity - allocatedQuantity;

      return {
        id: trade.id,
        broker: normalizeBroker(trade.broker),
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

function createSellFormState(item: PositionItem): SellFormState {
  return {
    tradeDate: dayjs().format('YYYY-MM-DD'),
    quantity: '',
    price: item.latestPrice == null ? '' : String(item.latestPrice),
    fee: '0',
    notes: '',
    currency: item.currency,
    lotSelectionMethod: 'FIFO',
    allocations: {}
  };
}


function CompositionTooltip({
  active,
  payload
}: {
  active?: boolean;
  payload?: Array<{ payload?: CompositionItem }>;
}) {
  const item = payload?.[0]?.payload;
  if (!active || !item) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/95 px-4 py-3 shadow-2xl">
      <p className="text-sm font-semibold text-white">{item.ticker}</p>
      <p className="mt-2 text-sm text-slate-300">{formatCurrency(item.value, item.currency)}</p>
      <p className="mt-1 text-sm text-slate-300">{formatQuantity(item.quantity)} shares</p>
      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{formatPercent(item.share)}</p>
    </div>
  );
}

export function PositionsPage() {
  const pendingSortScrollYRef = useRef<number | null>(null);
  const [items, setItems] = useState<PositionItem[]>([]);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPositionKey, setExpandedPositionKey] = useState<string | null>(null);
  const [editingLotId, setEditingLotId] = useState<number | null>(null);
  const [lotForm, setLotForm] = useState<LotFormState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [savingLotId, setSavingLotId] = useState<number | null>(null);
  const [deletingLotId, setDeletingLotId] = useState<number | null>(null);
  const [sort, setSort] = useState<SortState>({ key: 'ticker', direction: 'asc' });
  const [sellPosition, setSellPosition] = useState<PositionItem | null>(null);
  const [sellForm, setSellForm] = useState<SellFormState | null>(null);
  const [sellAvailableLots, setSellAvailableLots] = useState<AvailableLot[]>([]);
  const [sellLotsLoading, setSellLotsLoading] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);
  const [isSelling, setIsSelling] = useState(false);

  async function refreshPositions(options?: { silent?: boolean }) {
    try {
      if (!options?.silent) {
        setLoading(true);
      }

      const response = await fetchPositions();
      setItems(response);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to refresh positions');
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }

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

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshPositions({ silent: true });
    }, PRICE_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!sellPosition) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sellPosition]);

  useEffect(() => {
    if (!sellPosition || !sellForm?.tradeDate) {
      setSellAvailableLots([]);
      return;
    }

    const ticker = sellPosition.ticker;
    const broker = normalizeBroker(sellPosition.broker);
    const tradeDate = sellForm.tradeDate;
    let cancelled = false;

    async function loadSellLots() {
      try {
        setSellLotsLoading(true);
        const response = await fetchAvailableLots(ticker, tradeDate);
        if (!cancelled) {
          setSellAvailableLots(response.filter((lot) => normalizeBroker(lot.broker) === broker));
        }
      } catch (loadLotsError) {
        if (!cancelled) {
          setSellAvailableLots([]);
          setSellError(loadLotsError instanceof Error ? loadLotsError.message : 'Failed to load available lots');
        }
      } finally {
        if (!cancelled) {
          setSellLotsLoading(false);
        }
      }
    }

    void loadSellLots();

    return () => {
      cancelled = true;
    };
  }, [sellForm?.tradeDate, sellPosition]);

  useLayoutEffect(() => {
    const pendingScrollY = pendingSortScrollYRef.current;
    if (pendingScrollY == null) {
      return;
    }

    const restoreScroll = () => window.scrollTo({ top: pendingScrollY, left: window.scrollX, behavior: 'auto' });
    restoreScroll();
    window.requestAnimationFrame(() => {
      restoreScroll();
      window.setTimeout(() => {
        restoreScroll();
        pendingSortScrollYRef.current = null;
      }, 50);
    });
  }, [sort]);

  const editableLots = useMemo(() => buildEditableLots(trades), [trades]);

  const lotsByPositionKey = useMemo(() => {
    const result = new Map<string, EditableLot[]>();
    for (const lot of editableLots) {
      const key = getLotKey(lot);
      const current = result.get(key) ?? [];
      current.push(lot);
      result.set(key, current);
    }
    return result;
  }, [editableLots]);

  const summary = useMemo(() => buildPositionSummary(items), [items]);


  const compositionData = useMemo(() => {
    const base = items
      .filter((item) => item.marketValue != null && item.marketValue > 0)
      .map((item) => ({
        ticker: item.ticker,
        value: item.marketValue ?? 0,
        quantity: item.quantity,
        currency: item.currency
      }));

    const total = base.reduce((sum, item) => sum + item.value, 0);

    return base.map((item) => ({
      ...item,
      share: total === 0 ? 0 : item.value / total
    })) satisfies CompositionItem[];
  }, [items]);

  const hasIncompleteComposition = useMemo(
    () => items.some((item) => item.marketValue == null),
    [items]
  );


  function sortPositionItems(sourceItems: PositionItem[]) {
    return [...sourceItems].sort((left, right) => {
      const multiplier = sort.direction === 'asc' ? 1 : -1;

      if (sort.key === 'ticker') {
        return (left.ticker.localeCompare(right.ticker) || normalizeBroker(left.broker).localeCompare(normalizeBroker(right.broker))) * multiplier;
      }

      const leftValue = left[sort.key];
      const rightValue = right[sort.key];

      if (leftValue == null && rightValue == null) {
        return left.ticker.localeCompare(right.ticker);
      }

      if (leftValue == null) {
        return 1;
      }

      if (rightValue == null) {
        return -1;
      }

      if (leftValue < rightValue) {
        return -1 * multiplier;
      }

      if (leftValue > rightValue) {
        return 1 * multiplier;
      }

      return left.ticker.localeCompare(right.ticker);
    });
  }

  const sortedItems = useMemo(() => sortPositionItems(items), [items, sort]);

  const brokerGroups = useMemo(() => {
    const groups = new Map<string, PositionItem[]>();
    for (const item of items) {
      const broker = normalizeBroker(item.broker);
      groups.set(broker, [...(groups.get(broker) ?? []), item]);
    }

    return [...groups.entries()]
      .map(([broker, brokerItems]) => ({ broker, items: sortPositionItems(brokerItems), summary: buildPositionSummary(brokerItems) }))
      .sort((left, right) => left.broker.localeCompare(right.broker));
  }, [items, sort]);

  function toggleSort(key: PositionSortKey) {
    pendingSortScrollYRef.current = window.scrollY;
    setSort((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === 'asc' ? 'desc' : 'asc'
        };
      }

      return {
        key,
        direction: key === 'ticker' ? 'asc' : 'desc'
      };
    });
  }

  function renderSortableHeader(label: string, key: PositionSortKey, compact = false) {
    return (
      <th className={compact ? 'px-2 py-3 leading-tight' : 'px-4 py-3'} aria-sort={sort.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleSort(key)}
          className={`${compact ? 'whitespace-normal break-words' : 'whitespace-nowrap'} text-left transition hover:text-white`}
        >
          {`${label}${renderSortIndicator(sort.key === key, sort.direction)}`}
        </button>
      </th>
    );
  }

  function resetLotEditor() {
    setEditingLotId(null);
    setLotForm(null);
  }

  function openSellPosition(item: PositionItem) {
    setSellPosition(item);
    setSellForm(createSellFormState(item));
    setSellError(null);
    setActionError(null);
    setActionMessage(null);
  }

  function closeSellPosition(options?: { force?: boolean }) {
    if (isSelling && !options?.force) {
      return;
    }

    setSellPosition(null);
    setSellForm(null);
    setSellAvailableLots([]);
    setSellError(null);
  }

  function togglePosition(item: PositionItem) {
    const key = getPositionKey(item);
    setExpandedPositionKey((current) => (current === key ? null : key));
    setActionError(null);
    setActionMessage(null);
    resetLotEditor();
  }

  function startEditing(lot: EditableLot) {
    setExpandedPositionKey(getLotKey(lot));
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
      broker: normalizeBroker(lot.broker),
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
      setExpandedPositionKey(getLotKey(lot));
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

    const confirmed = window.confirm(
      `Delete BUY lot #${lot.id} for ${normalizeBroker(lot.broker)} ${lot.ticker}?\n\n` +
      `Trade date: ${lot.tradeDate}\n` +
      `Open quantity: ${formatQuantity(lot.availableQuantity)} shares\n\n` +
      'This cannot be undone.'
    );
    if (!confirmed) {
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
      setExpandedPositionKey(getLotKey(lot));
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : 'Failed to delete lot');
    } finally {
      setDeletingLotId(null);
    }
  }

  async function handleSellSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sellPosition || !sellForm) {
      return;
    }

    const quantity = toNumber(sellForm.quantity);
    const price = toNumber(sellForm.price);
    const fee = toNumber(sellForm.fee);
    const allocationEntries = sellAvailableLots
      .map((lot) => ({ lot, quantity: toNumber(sellForm.allocations[lot.buyTradeId] ?? '0') }))
      .filter((entry) => entry.quantity > QUANTITY_EPSILON);
    const allocatedTotal = allocationEntries.reduce((sum, entry) => sum + entry.quantity, 0);

    if (!sellForm.tradeDate) {
      setSellError('Trade date is required.');
      return;
    }

    if (quantity <= 0) {
      setSellError('SELL quantity must be greater than 0.');
      return;
    }

    if (quantity - sellPosition.quantity > QUANTITY_EPSILON) {
      setSellError(`SELL quantity cannot exceed the open position of ${formatQuantity(sellPosition.quantity)} shares.`);
      return;
    }

    if (price <= 0) {
      setSellError('SELL price must be greater than 0.');
      return;
    }

    if (fee < 0) {
      setSellError('Fee cannot be negative.');
      return;
    }

    if (sellForm.lotSelectionMethod === 'SPECIFIC') {
      if (sellLotsLoading) {
        setSellError('Available lots are still loading.');
        return;
      }

      if (allocationEntries.length === 0) {
        setSellError('Specific lot selection requires at least one lot allocation.');
        return;
      }

      for (const entry of allocationEntries) {
        if (entry.quantity - entry.lot.availableQuantity > QUANTITY_EPSILON) {
        setSellError(`Allocation for BUY lot #${entry.lot.buyTradeId} exceeds available quantity.`);
          return;
        }
      }

      if (Math.abs(allocatedTotal - quantity) > QUANTITY_EPSILON) {
        setSellError('Specific lot allocation total must match the SELL quantity exactly.');
        return;
      }
    }

    const payload: TradePayload = {
      broker: normalizeBroker(sellPosition.broker),
      ticker: sellPosition.ticker,
      tradeDate: sellForm.tradeDate,
      type: 'SELL',
      quantity,
      price,
      fee,
      notes: sellForm.notes.trim().length === 0 ? null : sellForm.notes.trim(),
      currency: sellForm.currency || sellPosition.currency,
      lotSelectionMethod: sellForm.lotSelectionMethod
    };

    if (sellForm.lotSelectionMethod === 'SPECIFIC') {
      payload.allocations = allocationEntries.map((entry) => ({
        buyTradeId: entry.lot.buyTradeId,
        quantity: entry.quantity
      }));
    }

    try {
      setIsSelling(true);
      await createTrade(payload);
      setSellError(null);
      setActionError(null);
      setActionMessage(`Created SELL for ${normalizeBroker(sellPosition.broker)} ${sellPosition.ticker}.`);
      closeSellPosition({ force: true });
      await loadData();
    } catch (sellSubmitError) {
      setSellError(sellSubmitError instanceof Error ? sellSubmitError.message : 'Failed to create SELL trade');
    } finally {
      setIsSelling(false);
    }
  }

  function renderSellModal() {
    if (!sellPosition || !sellForm) {
      return null;
    }

    const sellQuantity = toNumber(sellForm.quantity);
    const allocatedTotal = sellAvailableLots.reduce((sum, lot) => sum + toNumber(sellForm.allocations[lot.buyTradeId] ?? '0'), 0);
    const remainingAllocation = sellQuantity - allocatedTotal;
    const estimatedProceeds = sellQuantity * toNumber(sellForm.price) - toNumber(sellForm.fee);
    const isSpecific = sellForm.lotSelectionMethod === 'SPECIFIC';

    return createPortal(
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/85 px-4 py-6 backdrop-blur-sm" onClick={() => closeSellPosition()}>
        <section
          className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-3xl border border-white/10 bg-slate-950 p-5 shadow-2xl shadow-black/50"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Sell {normalizeBroker(sellPosition.broker)} {sellPosition.ticker}</h2>
              <p className="mt-1 text-sm text-slate-400">
                Open position: {formatQuantity(sellPosition.quantity)} shares. Current price: {formatCurrency(sellPosition.latestPrice, sellPosition.currency)}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => closeSellPosition()}
              disabled={isSelling}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-500"
            >
              Close
            </button>
          </div>

          {sellError ? (
            <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{sellError}</div>
          ) : null}

          <form className="mt-5 space-y-5" onSubmit={(event) => void handleSellSubmit(event)}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-300">
                <span>Trade Date</span>
                <input
                  type="date"
                  value={sellForm.tradeDate}
                  onChange={(event) => setSellForm((current) => current ? { ...current, tradeDate: event.target.value } : current)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span>Quantity</span>
                <input
                  type="number"
                  min="0"
                  max={sellPosition.quantity}
                  step="0.01"
                  value={sellForm.quantity}
                  onChange={(event) => setSellForm((current) => current ? { ...current, quantity: event.target.value } : current)}
                  placeholder={formatQuantity(sellPosition.quantity)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span>Sell Price</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={sellForm.price}
                  onChange={(event) => setSellForm((current) => current ? { ...current, price: event.target.value } : current)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span>Fee</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={sellForm.fee}
                  onChange={(event) => setSellForm((current) => current ? { ...current, fee: event.target.value } : current)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {(['FIFO', 'SPECIFIC'] as LotSelectionMethod[]).map((method) => {
                const isActive = sellForm.lotSelectionMethod === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setSellForm((current) => current ? { ...current, lotSelectionMethod: method } : current)}
                    className={['rounded-2xl border px-4 py-4 text-left transition', isActive ? 'border-emerald-300/40 bg-emerald-400/10 text-white' : 'border-white/10 bg-white/5 text-slate-300'].join(' ')}
                  >
                    <span className="text-sm font-semibold">{method === 'FIFO' ? 'FIFO Auto Allocation' : 'Specific Lot Selection'}</span>
                    <span className="mt-1 block text-xs text-slate-400">
                      {method === 'FIFO' ? 'Backend will allocate shares using FIFO.' : 'Choose exact BUY lots and quantities for this SELL.'}
                    </span>
                  </button>
                );
              })}
            </div>

            {isSpecific ? (
              <div className="rounded-2xl border border-white/10 bg-white/5">
                <div className="grid gap-3 border-b border-white/10 px-4 py-3 sm:grid-cols-3">
                  <Metric label="Allocated" value={formatQuantity(allocatedTotal)} />
                  <Metric label="Remaining" value={formatQuantity(remainingAllocation)} />
                  <Metric label="Available Lots" value={sellLotsLoading ? 'Loading' : String(sellAvailableLots.length)} />
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-white/10 bg-slate-950/40 text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Lot</th>
                        <th className="px-4 py-3">Buy Date</th>
                        <th className="px-4 py-3">Open Qty</th>
                        <th className="px-4 py-3">Buy Price</th>
                        <th className="px-4 py-3">Sell Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sellLotsLoading ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading available lots...</td>
                        </tr>
                      ) : sellAvailableLots.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No open lots are available for this position.</td>
                        </tr>
                      ) : (
                        sellAvailableLots.map((lot) => (
                          <tr key={lot.buyTradeId} className="border-b border-white/10 text-slate-200 last:border-b-0">
                            <td className="px-4 py-3 font-medium text-white">#{lot.buyTradeId}</td>
                            <td className="px-4 py-3">{lot.tradeDate}</td>
                            <td className="px-4 py-3">{formatQuantity(lot.availableQuantity)}</td>
                            <td className="px-4 py-3">{formatCurrency(lot.price, lot.currency)}</td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="0"
                                max={lot.availableQuantity}
                                step="0.01"
                                value={sellForm.allocations[lot.buyTradeId] ?? ''}
                                onChange={(event) => setSellForm((current) => current ? { ...current, allocations: { ...current.allocations, [lot.buyTradeId]: event.target.value } } : current)}
                                className="w-28 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-white outline-none transition focus:border-emerald-300/40"
                                placeholder="0.00"
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                FIFO mode is active. Use Specific Lot Selection if you need to choose exact BUY lots from this position.
              </div>
            )}

            <label className="space-y-2 text-sm text-slate-300">
              <span>Notes</span>
              <textarea
                rows={3}
                value={sellForm.notes}
                onChange={(event) => setSellForm((current) => current ? { ...current, notes: event.target.value } : current)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40"
              />
            </label>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
                Estimated proceeds: {formatCurrency(estimatedProceeds, sellForm.currency)}
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={isSelling}
                  className="rounded-full bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
                >
                  {isSelling ? 'Selling...' : 'Create SELL'}
                </button>
                <button
                  type="button"
                  onClick={() => closeSellPosition()}
                  disabled={isSelling}
                  className="rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:text-white disabled:cursor-not-allowed disabled:text-slate-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>,
      document.body
    );
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Open Tickers</p>
            <p className="mt-2 text-2xl font-semibold text-white">{items.length}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Open Lots</p>
            <p className="mt-2 text-2xl font-semibold text-white">{summary.totalLots}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:col-span-2 xl:col-span-2">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Market Value</p>
            <p className="mt-2 whitespace-nowrap text-sm font-semibold leading-tight tracking-tight text-white sm:text-base lg:text-lg xl:text-xl">
              {formatCurrency(summary.totalMarketValue)}
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:col-span-2 xl:col-span-2">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Unrealized PnL</p>
            <p className={`mt-2 whitespace-nowrap text-sm font-semibold leading-tight tracking-tight sm:text-base lg:text-lg xl:text-xl ${getTone(summary.totalUnrealizedPnL)}`}>
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

      <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
        <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 md:col-span-2 xl:col-span-2">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Shares Open</p>
          <p className="mt-2 text-2xl font-semibold text-white">{summary.totalQuantity.toFixed(2)}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 md:col-span-2 xl:col-span-2">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Cost Basis</p>
          <p className="mt-2 whitespace-nowrap text-sm font-semibold leading-tight tracking-tight text-white sm:text-base lg:text-lg xl:text-xl">
            {formatCurrency(summary.totalCostBasis)}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 md:col-span-2 xl:col-span-2">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Market Value</p>
          <p className="mt-2 whitespace-nowrap text-sm font-semibold leading-tight tracking-tight text-white sm:text-base lg:text-lg xl:text-xl">
            {formatCurrency(summary.totalMarketValue)}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 md:col-span-2 xl:col-span-2">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Net PnL</p>
          <p className={`mt-2 whitespace-nowrap text-sm font-semibold leading-tight tracking-tight sm:text-base lg:text-lg xl:text-xl ${getTone(summary.totalUnrealizedPnL)}`}>
            {formatCurrency(summary.totalUnrealizedPnL)}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Return Rate</p>
          <p className={`mt-2 text-2xl font-semibold ${getTone(summary.totalReturnRate)}`}>
            {formatPercent(summary.totalReturnRate)}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 md:col-span-2 xl:col-span-2">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Today's Gain / Loss</p>
          <p className={`mt-2 whitespace-nowrap text-sm font-semibold leading-tight tracking-tight sm:text-base lg:text-lg xl:text-xl ${getTone(summary.totalTodaysPnL)}`}>
            {formatCurrency(summary.totalTodaysPnL)}
          </p>
        </article>
      </div>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <article className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Current Composition</h3>
              <p className="mt-1 text-sm text-slate-400">Current stock mix by market value.</p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {compositionData.length} ticker{compositionData.length === 1 ? '' : 's'}
            </div>
          </div>

          {hasIncompleteComposition ? (
            <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Some tickers are missing current prices, so the pie chart only includes positions with available market values.
            </div>
          ) : null}

          <div className="mt-5 h-80">
            {loading ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-slate-950/40 text-sm text-slate-400">
                Loading composition...
              </div>
            ) : compositionData.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-slate-950/40 text-sm text-slate-400">
                No market-value composition available yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={compositionData}
                    dataKey="value"
                    nameKey="ticker"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={3}
                  >
                    {compositionData.map((entry, index) => (
                      <Cell key={entry.ticker} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CompositionTooltip />} cursor={false} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-lg font-semibold text-white">Allocation Breakdown</h3>
          <p className="mt-1 text-sm text-slate-400">Each slice shows its share of the current market value.</p>

          <div className="mt-5 space-y-3">
            {compositionData.length === 0 ? (
              <p className="text-sm text-slate-400">No composition data to display.</p>
            ) : compositionData.map((item, index) => {
              return (
                <div key={item.ticker} className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                      <span className="font-medium text-white">{item.ticker}</span>
                    </div>
                    <span className="text-sm text-slate-300">{formatCurrency(item.value, item.currency)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm text-slate-300">
                    <span>{formatQuantity(item.quantity)} shares</span>
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{formatPercent(item.share)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <div className="rounded-3xl border border-white/10 bg-white/5">
        <div className="border-b border-white/10 px-5 py-4">
          <h3 className="text-lg font-semibold text-white">All Brokers Positions</h3>
          <p className="mt-1 text-sm text-slate-400">Combined open positions across every broker.</p>
        </div>
        <PositionTableTotals summary={summary} />
        <div className="overflow-hidden">
          <table className="w-full table-fixed text-[12px] leading-tight">
            <colgroup>
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead className="border-b border-white/10 bg-slate-950/40 text-left text-[10px] uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-2 py-3 leading-tight">Actions</th>
                <th className="px-2 py-3 leading-tight">Broker</th>
                {renderSortableHeader('Ticker', 'ticker', true)}
                {renderSortableHeader('Quantity', 'quantity', true)}
                {renderSortableHeader('Avg Cost', 'averageCost', true)}
                {renderSortableHeader('Latest Price', 'latestPrice', true)}
                {renderSortableHeader('Cost Basis', 'costBasis', true)}
                {renderSortableHeader('Market Value', 'marketValue', true)}
                {renderSortableHeader('Unrealized', 'unrealizedPnL', true)}
                {renderSortableHeader('Today', 'todaysPnL', true)}
                {renderSortableHeader('Return', 'unrealizedReturnRate', true)}
                {renderSortableHeader('Open Lots', 'openLotsCount', true)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-slate-400">
                    Loading positions...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-slate-400">
                    No open positions right now.
                  </td>
                </tr>
              ) : (
                sortedItems.flatMap((item) => {
                  const positionKey = getPositionKey(item);
                  const lots = lotsByPositionKey.get(positionKey) ?? [];
                  const isExpanded = expandedPositionKey === positionKey;

                  return [
                    <tr key={positionKey} className="border-b border-white/10 text-slate-200 last:border-b-0">
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          onClick={() => togglePosition(item)}
                          className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 text-[11px] font-medium leading-tight text-emerald-200 transition hover:bg-emerald-400/20"
                        >
                          {isExpanded ? 'Hide Lots' : 'Manage Lots'}
                        </button>
                      </td>
                      <td className="break-words px-2 py-3">
                        <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-200">{normalizeBroker(item.broker)}</span>
                      </td>
                      <td className="break-words px-2 py-3">
                        <div className="font-medium text-white">{item.ticker}</div>
                        <div className="mt-1 text-[10px] text-slate-400">{formatCurrency(item.latestPrice, item.currency)}</div>
                      </td>
                      <td className="break-words px-2 py-3">{item.quantity.toFixed(2)}</td>
                      <td className="break-words px-2 py-3">{formatCurrency(item.averageCost, item.currency)}</td>
                      <td className="break-words px-2 py-3">{formatCurrency(item.latestPrice, item.currency)}</td>
                      <td className="break-words px-2 py-3">{formatCurrency(item.costBasis, item.currency)}</td>
                      <td className="break-words px-2 py-3">{formatCurrency(item.marketValue, item.currency)}</td>
                      <td className={`break-words px-2 py-3 font-semibold ${getTone(item.unrealizedPnL)}`}>
                        {formatCurrency(item.unrealizedPnL, item.currency)}
                      </td>
                      <td className={`break-words px-2 py-3 font-semibold ${getTone(item.todaysPnL)}`}>
                        <div>{formatCurrency(item.todaysPnL, item.currency)}</div>
                        
                      </td>
                      <td className={`break-words px-2 py-3 ${getTone(item.unrealizedReturnRate)}`}>
                        {formatPercent(item.unrealizedReturnRate)}
                      </td>
                      <td className="break-words px-2 py-3">{item.openLotsCount}</td>
                    </tr>,
                    isExpanded ? (
                      <tr key={`${positionKey}-editor`} className="border-b border-white/10 bg-slate-950/20 text-slate-200 last:border-b-0">
                        <td colSpan={12} className="px-4 py-5">
                          <div className="space-y-4">
                            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <h3 className="text-base font-semibold text-white">Manage {normalizeBroker(item.broker)} {item.ticker} Open Lots</h3>
                                <p className="mt-1 text-sm text-slate-400">
                                  Edit the underlying BUY lots that still have open shares. Delete is limited to fully unallocated lots.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => openSellPosition(item)}
                                  className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-100 transition hover:bg-amber-400/20"
                                >
                                  Sell Position
                                </button>
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

      {!loading && brokerGroups.length > 0 ? (
        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Broker Position Tables</h3>
            <p className="mt-1 text-sm text-slate-400">Separated position views for each broker.</p>
          </div>
          {brokerGroups.map((group) => (
            <div key={group.broker} className="rounded-3xl border border-white/10 bg-white/5">
              <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-base font-semibold text-white">{group.broker} Positions</h4>
                  <p className="mt-1 text-sm text-slate-400">{group.items.length} open ticker{group.items.length === 1 ? '' : 's'} in this broker.</p>
                </div>
              </div>
              <PositionTableTotals summary={group.summary} />
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-white/10 bg-slate-950/40 text-left text-xs uppercase tracking-[0.22em] text-slate-400">
                    <tr>
                      {renderSortableHeader('Ticker', 'ticker')}
                      {renderSortableHeader('Quantity', 'quantity')}
                      {renderSortableHeader('Avg Cost', 'averageCost')}
                      {renderSortableHeader('Latest Price', 'latestPrice')}
                      {renderSortableHeader('Cost Basis', 'costBasis')}
                      {renderSortableHeader('Market Value', 'marketValue')}
                      {renderSortableHeader('Unrealized', 'unrealizedPnL')}
                      {renderSortableHeader('Today', 'todaysPnL')}
                      {renderSortableHeader('Return', 'unrealizedReturnRate')}
                      {renderSortableHeader('Open Lots', 'openLotsCount')}
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={getPositionKey(item)} className="border-b border-white/10 text-slate-200 last:border-b-0">
                        <td className="px-4 py-4 font-medium text-white">{item.ticker}</td>
                        <td className="px-4 py-4">{item.quantity.toFixed(2)}</td>
                        <td className="px-4 py-4">{formatCurrency(item.averageCost, item.currency)}</td>
                        <td className="px-4 py-4">{formatCurrency(item.latestPrice, item.currency)}</td>
                        <td className="px-4 py-4">{formatCurrency(item.costBasis, item.currency)}</td>
                        <td className="px-4 py-4">{formatCurrency(item.marketValue, item.currency)}</td>
                        <td className={`px-4 py-4 font-semibold ${getTone(item.unrealizedPnL)}`}>{formatCurrency(item.unrealizedPnL, item.currency)}</td>
                        <td className={`px-4 py-4 font-semibold ${getTone(item.todaysPnL)}`}>{formatCurrency(item.todaysPnL, item.currency)}</td>
                        <td className={`px-4 py-4 ${getTone(item.unrealizedReturnRate)}`}>{formatPercent(item.unrealizedReturnRate)}</td>
                        <td className="px-4 py-4">{item.openLotsCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      ) : null}
      {renderSellModal()}
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

function PositionTableTotals({ summary }: { summary: PositionSummaryStats }) {
  return (
    <div className="grid gap-3 border-b border-white/10 bg-slate-950/25 px-5 py-4 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Total Cost Basis" value={formatCurrency(summary.totalCostBasis)} />
      <Metric label="Market Value" value={formatCurrency(summary.totalMarketValue)} />
      <Metric label="Unrealized" value={formatCurrency(summary.totalUnrealizedPnL)} />
      <Metric label="Today" value={formatCurrency(summary.totalTodaysPnL)} />
      <Metric label="Return" value={formatPercent(summary.totalReturnRate)} />
    </div>
  );
}
