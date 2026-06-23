import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import {
  createTrade,
  deleteTrade,
  downloadTradesCsv,
  downloadYearlySummaryCsv,
  fetchAvailableLots,
  fetchLatestPrice,
  fetchTrades,
  importTrades,
  updateTrade,
  type AvailableLot,
  type CsvTradeAllocationInput,
  type CsvTradeImportRow,
  type LotSelectionMethod,
  type TradePayload,
  type TradeRecord,
  type TradeType
} from '../lib/api';
import { parseCsv } from '../lib/csv';

type TradeFormState = {
  broker: string;
  ticker: string;
  tradeDate: string;
  type: TradeType;
  quantity: string;
  price: string;
  fee: string;
  notes: string;
  currency: string;
  lotSelectionMethod: LotSelectionMethod;
  allocations: Record<number, string>;
};

type LotEditorRow = AvailableLot & {
  buyTradeDate: string;
  buyPrice: number | null;
  editableAvailableQuantity: number;
};

type CsvPreviewRow = {
  rowNumber: number;
  status: 'ready' | 'error';
  parsed?: CsvTradeImportRow;
  error?: string;
  source: Record<string, string>;
};

const QUANTITY_EPSILON = 0.000001;
const REQUIRED_CSV_COLUMNS = ['ticker', 'tradeDate', 'type', 'quantity', 'price'];
const CUSTOM_BROKER_STORAGE_KEY = 'stock-tracking-custom-brokers';
const BROKER_OPTIONS = [
  'Firstrade',
  'E*TRADE',
  'Merrill Lynch',
  'Charles Schwab',
  'Fidelity',
  'Interactive Brokers',
  'Robinhood',
  'TD Ameritrade',
  'Vanguard',
  'Webull'
];
const JSON_IMPORT_EXAMPLE = `{
  "rows": [
    {
      "importRef": "AAPL-LOT-1",
      "broker": "Interactive Brokers",
      "ticker": "AAPL",
      "tradeDate": "2026-03-18",
      "type": "BUY",
      "quantity": 5,
      "price": 180,
      "fee": 1,
      "notes": "json buy",
      "currency": "USD"
    },
    {
      "broker": "Interactive Brokers",
      "ticker": "AAPL",
      "tradeDate": "2026-03-20",
      "type": "SELL",
      "quantity": 2,
      "price": 210,
      "fee": 1,
      "notes": "json specific sell",
      "currency": "USD",
      "lotSelectionMethod": "SPECIFIC",
      "allocations": [
        { "buyTradeRef": "AAPL-LOT-1", "quantity": 2 }
      ]
    }
  ]
}`;

function createDefaultFormState(): TradeFormState {
  return {
    broker: '',
    ticker: '',
    tradeDate: dayjs().format('YYYY-MM-DD'),
    type: 'BUY',
    quantity: '',
    price: '',
    fee: '0',
    notes: '',
    currency: 'USD',
    lotSelectionMethod: 'FIFO',
    allocations: {}
  };
}

function normalizeBroker(value: string | null | undefined) {
  const broker = value?.trim();
  return broker && broker.length > 0 ? broker : 'Unassigned';
}

function normalizeBrokerOption(value: string | null | undefined) {
  return value?.trim() ?? '';
}

function readCustomBrokerOptions() {
  try {
    const rawValue = localStorage.getItem(CUSTOM_BROKER_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((value) => normalizeBrokerOption(typeof value === 'string' ? value : null))
      .filter((value) => value.length > 0);
  } catch {
    return [];
  }
}

function persistCustomBrokerOptions(options: string[]) {
  localStorage.setItem(CUSTOM_BROKER_STORAGE_KEY, JSON.stringify(options));
}

function formatCurrency(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

function formatQuantity(value: number) {
  return value.toFixed(2);
}

function formatMethodLabel(trade: TradeRecord) {
  return trade.type === 'SELL' ? trade.lotSelectionMethod : 'BUY';
}

function toPositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCsvField(row: Record<string, string>, field: string) {
  const key = Object.keys(row).find((candidate) => candidate.trim().toLowerCase() === field.toLowerCase());
  return key ? row[key] ?? '' : '';
}

function parseCsvAllocations(rawValue: string, rowNumber: number): CsvTradeAllocationInput[] | undefined {
  if (rawValue.trim().length === 0) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error(`Row ${rowNumber}: allocations must be valid JSON`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Row ${rowNumber}: allocations must be a JSON array`);
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Row ${rowNumber}: allocation ${index + 1} must be an object`);
    }

    const allocation = item as Record<string, unknown>;
    const quantity = Number(allocation.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Row ${rowNumber}: allocation ${index + 1} quantity must be greater than 0`);
    }

    const buyTradeId = allocation.buyTradeId == null || allocation.buyTradeId === '' ? undefined : Number.parseInt(String(allocation.buyTradeId), 10);
    const buyTradeRef = typeof allocation.buyTradeRef === 'string' && allocation.buyTradeRef.trim().length > 0 ? allocation.buyTradeRef.trim() : undefined;

    if ((buyTradeId == null || !Number.isInteger(buyTradeId) || buyTradeId <= 0) && !buyTradeRef) {
      throw new Error(`Row ${rowNumber}: allocation ${index + 1} requires buyTradeId or buyTradeRef`);
    }

    return {
      buyTradeId: buyTradeId && buyTradeId > 0 ? buyTradeId : undefined,
      buyTradeRef,
      quantity
    };
  });
}

function buildCsvPreviewRow(source: Record<string, string>, rowNumber: number): CsvPreviewRow {
  try {
    const type = getCsvField(source, 'type').trim().toUpperCase();
    if (type !== 'BUY' && type !== 'SELL') {
      throw new Error(`Row ${rowNumber}: type must be BUY or SELL`);
    }

    const ticker = getCsvField(source, 'ticker').trim().toUpperCase();
    if (ticker.length === 0) {
      throw new Error(`Row ${rowNumber}: ticker is required`);
    }

    const tradeDate = getCsvField(source, 'tradeDate').trim();
    if (!dayjs(tradeDate).isValid()) {
      throw new Error(`Row ${rowNumber}: tradeDate must be valid`);
    }

    const quantity = Number(getCsvField(source, 'quantity'));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Row ${rowNumber}: quantity must be greater than 0`);
    }

    const price = Number(getCsvField(source, 'price'));
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Row ${rowNumber}: price must be greater than 0`);
    }

    const feeValue = getCsvField(source, 'fee');
    const fee = feeValue.trim().length === 0 ? 0 : Number(feeValue);
    if (!Number.isFinite(fee) || fee < 0) {
      throw new Error(`Row ${rowNumber}: fee must be 0 or greater`);
    }

    const lotSelectionValue = getCsvField(source, 'lotSelectionMethod').trim().toUpperCase();
    const lotSelectionMethod: LotSelectionMethod =
      type === 'SELL' && lotSelectionValue === 'SPECIFIC' ? 'SPECIFIC' : 'FIFO';
    const allocations = parseCsvAllocations(getCsvField(source, 'allocations'), rowNumber);

    if (type === 'SELL' && lotSelectionMethod === 'SPECIFIC' && (!allocations || allocations.length === 0)) {
      throw new Error(`Row ${rowNumber}: SPECIFIC SELL requires allocations JSON`);
    }

    return {
      rowNumber,
      status: 'ready',
      source,
      parsed: {
        importRef: getCsvField(source, 'importRef').trim() || undefined,
        broker: normalizeBroker(getCsvField(source, 'broker')),
        ticker,
        tradeDate,
        type,
        quantity,
        price,
        fee,
        notes: getCsvField(source, 'notes').trim() || null,
        currency: getCsvField(source, 'currency').trim().toUpperCase() || 'USD',
        lotSelectionMethod,
        allocations
      }
    };
  } catch (error) {
    return {
      rowNumber,
      status: 'error',
      source,
      error: error instanceof Error ? error.message : `Row ${rowNumber}: invalid CSV data`
    };
  }
}

function buildJsonPreviewRow(row: unknown, rowNumber: number): CsvPreviewRow {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return {
      rowNumber,
      status: 'error',
      source: {},
      error: `Row ${rowNumber}: JSON row must be an object`
    };
  }

  try {
    const record = row as Record<string, unknown>;
    const broker = normalizeBroker(typeof record.broker === 'string' ? record.broker : undefined);
    const type = typeof record.type === 'string' ? record.type.trim().toUpperCase() : '';
    if (type !== 'BUY' && type !== 'SELL') {
      throw new Error(`Row ${rowNumber}: type must be BUY or SELL`);
    }

    const ticker = typeof record.ticker === 'string' ? record.ticker.trim().toUpperCase() : '';
    if (ticker.length === 0) {
      throw new Error(`Row ${rowNumber}: ticker is required`);
    }

    const tradeDate = typeof record.tradeDate === 'string' ? record.tradeDate.trim() : '';
    if (!dayjs(tradeDate).isValid()) {
      throw new Error(`Row ${rowNumber}: tradeDate must be valid`);
    }

    const quantity = Number(record.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Row ${rowNumber}: quantity must be greater than 0`);
    }

    const price = Number(record.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Row ${rowNumber}: price must be greater than 0`);
    }

    const fee = record.fee == null || record.fee === '' ? 0 : Number(record.fee);
    if (!Number.isFinite(fee) || fee < 0) {
      throw new Error(`Row ${rowNumber}: fee must be 0 or greater`);
    }

    const lotSelectionMethod = type === 'SELL' && String(record.lotSelectionMethod ?? '').trim().toUpperCase() === 'SPECIFIC'
      ? 'SPECIFIC'
      : 'FIFO';

    const allocations = Array.isArray(record.allocations)
      ? record.allocations.map((item, index) => {
          if (!item || typeof item !== 'object') {
            throw new Error(`Row ${rowNumber}: allocation ${index + 1} must be an object`);
          }

          const allocation = item as Record<string, unknown>;
          const allocationQuantity = Number(allocation.quantity);
          if (!Number.isFinite(allocationQuantity) || allocationQuantity <= 0) {
            throw new Error(`Row ${rowNumber}: allocation ${index + 1} quantity must be greater than 0`);
          }

          const buyTradeId = allocation.buyTradeId == null || allocation.buyTradeId === '' ? undefined : Number.parseInt(String(allocation.buyTradeId), 10);
          const buyTradeRef = typeof allocation.buyTradeRef === 'string' && allocation.buyTradeRef.trim().length > 0 ? allocation.buyTradeRef.trim() : undefined;
          if ((buyTradeId == null || !Number.isInteger(buyTradeId) || buyTradeId <= 0) && !buyTradeRef) {
            throw new Error(`Row ${rowNumber}: allocation ${index + 1} requires buyTradeId or buyTradeRef`);
          }

          return {
            buyTradeId: buyTradeId && buyTradeId > 0 ? buyTradeId : undefined,
            buyTradeRef,
            quantity: allocationQuantity
          } satisfies CsvTradeAllocationInput;
        })
      : undefined;

    if (type === 'SELL' && lotSelectionMethod === 'SPECIFIC' && (!allocations || allocations.length === 0)) {
      throw new Error(`Row ${rowNumber}: SPECIFIC SELL requires allocations`);
    }

    return {
      rowNumber,
      status: 'ready',
      source: {
        importRef: typeof record.importRef === 'string' ? record.importRef : '',
        broker,
        ticker,
        tradeDate,
        type,
        quantity: String(quantity),
        price: String(price),
        fee: String(fee),
        notes: typeof record.notes === 'string' ? record.notes : '',
        currency: typeof record.currency === 'string' ? record.currency.toUpperCase() : 'USD',
        lotSelectionMethod,
        allocations: allocations ? JSON.stringify(allocations) : ''
      },
      parsed: {
        importRef: typeof record.importRef === 'string' && record.importRef.trim().length > 0 ? record.importRef.trim() : undefined,
        broker,
        ticker,
        tradeDate,
        type: type as TradeType,
        quantity,
        price,
        fee,
        notes: typeof record.notes === 'string' ? record.notes.trim() || null : record.notes == null ? null : String(record.notes),
        currency: typeof record.currency === 'string' && record.currency.trim() ? record.currency.trim().toUpperCase() : 'USD',
        lotSelectionMethod,
        allocations
      }
    };
  } catch (error) {
    return {
      rowNumber,
      status: 'error',
      source: {},
      error: error instanceof Error ? error.message : `Row ${rowNumber}: invalid JSON data`
    };
  }
}

function parseJsonImportPayload(text: string): CsvTradeImportRow[] {
  if (text.trim().length === 0) {
    throw new Error('JSON import text is empty');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('JSON import text must be valid JSON');
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown }).rows)
      ? (parsed as { rows: unknown[] }).rows
      : null;

  if (!rows || rows.length === 0) {
    throw new Error('JSON payload must be an array of rows or an object with a non-empty rows array');
  }

  const previewRows = rows.map((row, index) => buildJsonPreviewRow(row, index + 1));
  const firstError = previewRows.find((row) => row.status === 'error');
  if (firstError?.error) {
    throw new Error(firstError.error);
  }

  return previewRows.map((row) => row.parsed as CsvTradeImportRow);
}


export function TradesPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tradeDateInputRef = useRef<HTMLInputElement | null>(null);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState<string | null>(null);
  const [tableMessage, setTableMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [hasSubmittedForm, setHasSubmittedForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTradeIds, setSelectedTradeIds] = useState<number[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [editingTradeId, setEditingTradeId] = useState<number | null>(null);
  const [availableLots, setAvailableLots] = useState<AvailableLot[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [lotsError, setLotsError] = useState<string | null>(null);
  const [form, setForm] = useState<TradeFormState>(createDefaultFormState);
  const [customBrokerOptions, setCustomBrokerOptions] = useState<string[]>(readCustomBrokerOptions);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvPreviewRows, setCsvPreviewRows] = useState<CsvPreviewRow[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvMessage, setCsvMessage] = useState<string | null>(null);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [jsonImportText, setJsonImportText] = useState('');
  const [jsonImportError, setJsonImportError] = useState<string | null>(null);
  const [jsonImportMessage, setJsonImportMessage] = useState<string | null>(null);
  const [isImportingJson, setIsImportingJson] = useState(false);
  const [isJsonEditorOpen, setIsJsonEditorOpen] = useState(false);
  const [isTradeFormOpen, setIsTradeFormOpen] = useState(false);
  const [expandedStatementIds, setExpandedStatementIds] = useState<Record<string, boolean>>({ 'all-brokers': true });
  const [priceLookupLoading, setPriceLookupLoading] = useState(false);
  const [priceLookupError, setPriceLookupError] = useState<string | null>(null);
  const [latestPriceInfo, setLatestPriceInfo] = useState<string | null>(null);

  const editingTrade = useMemo(
    () => (editingTradeId == null ? null : trades.find((trade) => trade.id === editingTradeId) ?? null),
    [editingTradeId, trades]
  );

  const isSell = form.type === 'SELL';
  const isSpecific = isSell && form.lotSelectionMethod === 'SPECIFIC';
  const quantity = toPositiveNumber(form.quantity);
  const price = toPositiveNumber(form.price);
  const fee = toPositiveNumber(form.fee);
  const selectedTradeIdSet = useMemo(() => new Set(selectedTradeIds), [selectedTradeIds]);
  const brokerOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const broker of [...BROKER_OPTIONS, ...customBrokerOptions]) {
      const normalized = normalizeBrokerOption(broker);
      if (normalized.length > 0) {
        options.set(normalized.toLowerCase(), normalized);
      }
    }

    return [...options.values()].sort((left, right) => left.localeCompare(right));
  }, [customBrokerOptions]);
  const currentBrokerOption = normalizeBrokerOption(form.broker);
  const canAddCurrentBroker = currentBrokerOption.length > 0 && !brokerOptions.some((broker) => broker.toLowerCase() === currentBrokerOption.toLowerCase());

  async function loadTrades() {
    try {
      setLoading(true);
      const response = await fetchTrades();
      setTrades(response.items);
      setTableError(null);
    } catch (error) {
      setTableError(error instanceof Error ? error.message : 'Unable to load trades');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTrades();
  }, []);

  useEffect(() => {
    if (!isJsonEditorOpen && !isTradeFormOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isJsonEditorOpen, isTradeFormOpen]);

  useEffect(() => {
    if (!isJsonEditorOpen && !isTradeFormOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      if (isJsonEditorOpen) {
        setIsJsonEditorOpen(false);
        return;
      }

      if (isTradeFormOpen && !isSubmitting) {
        setIsTradeFormOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isJsonEditorOpen, isSubmitting, isTradeFormOpen]);

  useEffect(() => {
    if (!isSpecific) {
      setAvailableLots([]);
      setLotsError(null);
      setLotsLoading(false);
      return;
    }

    const ticker = form.ticker.trim().toUpperCase();
    if (ticker.length === 0 || form.tradeDate.length === 0) {
      setAvailableLots([]);
      setLotsError(null);
      setLotsLoading(false);
      return;
    }

    let isCancelled = false;

    async function loadLots() {
      try {
        setLotsLoading(true);
        const response = await fetchAvailableLots(ticker, form.tradeDate);
        if (!isCancelled) {
          setAvailableLots(response);
          setLotsError(null);
        }
      } catch (error) {
        if (!isCancelled) {
          setAvailableLots([]);
          setLotsError(error instanceof Error ? error.message : 'Unable to load available lots');
        }
      } finally {
        if (!isCancelled) {
          setLotsLoading(false);
        }
      }
    }

    void loadLots();

    return () => {
      isCancelled = true;
    };
  }, [form.ticker, form.tradeDate, isSpecific]);

  const lotRows = useMemo<LotEditorRow[]>(() => {
    if (!isSpecific) {
      return [];
    }

    const rows = new Map<number, LotEditorRow>();
    const existingAllocationMap = new Map<number, { quantity: number; buyTradeDate: string; buyPrice: number | null }>();

    if (editingTrade?.type === 'SELL') {
      for (const allocation of editingTrade.allocations) {
        existingAllocationMap.set(allocation.buyTradeId, {
          quantity: allocation.quantity,
          buyTradeDate: allocation.buyTradeDateSnapshot ?? '',
          buyPrice: allocation.buyPriceSnapshot
        });
      }
    }

    for (const lot of availableLots) {
      const currentAllocation = existingAllocationMap.get(lot.buyTradeId)?.quantity ?? 0;
      rows.set(lot.buyTradeId, {
        ...lot,
        buyTradeDate: lot.tradeDate,
        buyPrice: lot.price,
        editableAvailableQuantity: lot.availableQuantity + currentAllocation
      });
    }

    for (const [buyTradeId, currentAllocation] of existingAllocationMap.entries()) {
      if (rows.has(buyTradeId)) {
        continue;
      }

      rows.set(buyTradeId, {
        buyTradeId,
        broker: normalizeBroker(editingTrade?.broker),
        ticker: form.ticker.trim().toUpperCase(),
        tradeDate: currentAllocation.buyTradeDate,
        buyTradeDate: currentAllocation.buyTradeDate,
        originalQuantity: currentAllocation.quantity,
        allocatedQuantity: 0,
        availableQuantity: currentAllocation.quantity,
        editableAvailableQuantity: currentAllocation.quantity,
        price: currentAllocation.buyPrice ?? 0,
        buyPrice: currentAllocation.buyPrice,
        fee: 0,
        currency: form.currency || 'USD'
      });
    }

    return [...rows.values()].sort((left, right) => {
      if (left.buyTradeDate === right.buyTradeDate) {
        return left.buyTradeId - right.buyTradeId;
      }
      return left.buyTradeDate.localeCompare(right.buyTradeDate);
    });
  }, [availableLots, editingTrade, form.currency, form.ticker, isSpecific]);

  const allocationSummary = useMemo(() => {
    const entries = lotRows
      .map((row) => {
        const allocatedNow = toPositiveNumber(form.allocations[row.buyTradeId] ?? '0');
        return {
          row,
          quantity: Number.isFinite(allocatedNow) ? allocatedNow : 0
        };
      })
      .filter((entry) => entry.quantity > 0);

    const allocatedTotal = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    const estimatedCost = entries.reduce((sum, entry) => sum + entry.quantity * (entry.row.buyPrice ?? 0), 0);
    const proportionalFee = quantity > 0 ? fee * (allocatedTotal / quantity) : 0;
    const estimatedRealizedPnL = allocatedTotal * price - estimatedCost - proportionalFee;

    return {
      entries,
      allocatedTotal,
      remainingQuantity: quantity - allocatedTotal,
      estimatedCost,
      estimatedRealizedPnL
    };
  }, [fee, form.allocations, lotRows, price, quantity]);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    if (form.ticker.trim().length === 0) {
      errors.push('Ticker is required.');
    }

    if (!dayjs(form.tradeDate).isValid()) {
      errors.push('Trade date must be a valid date.');
    }

    if (quantity <= 0) {
      errors.push('Quantity must be greater than 0.');
    }

    if (price <= 0) {
      errors.push('Price must be greater than 0.');
    }

    if (fee < 0) {
      errors.push('Fee cannot be negative.');
    }

    if (isSpecific) {
      for (const row of lotRows) {
        const value = form.allocations[row.buyTradeId] ?? '';
        if (value.trim().length === 0) {
          continue;
        }

        const allocationQuantity = Number(value);
        if (!Number.isFinite(allocationQuantity) || allocationQuantity < 0) {
          errors.push(`Allocation for lot #${row.buyTradeId} must be 0 or greater.`);
          continue;
        }

        if (allocationQuantity - row.editableAvailableQuantity > QUANTITY_EPSILON) {
          errors.push(`Allocation for lot #${row.buyTradeId} exceeds available quantity.`);
        }
      }

      if (!lotsLoading && lotRows.length === 0) {
        errors.push('No BUY lots are available for specific allocation.');
      }

      if (Math.abs(allocationSummary.remainingQuantity) > QUANTITY_EPSILON) {
        errors.push('Allocated quantity must match the SELL quantity exactly.');
      }
    }

    return errors;
  }, [allocationSummary.remainingQuantity, fee, form.allocations, form.ticker, form.tradeDate, isSpecific, lotRows, lotsLoading, price, quantity]);

  const summaryCards = useMemo(() => {
    const buyCount = trades.filter((trade) => trade.type === 'BUY').length;
    const sellCount = trades.filter((trade) => trade.type === 'SELL').length;
    const brokerCount = new Set(trades.map((trade) => normalizeBroker(trade.broker))).size;

    return [
      { label: 'Total Trades', value: String(trades.length), tone: 'text-white' },
      { label: 'BUY Orders', value: String(buyCount), tone: 'text-sky-300' },
      { label: 'SELL Orders', value: String(sellCount), tone: 'text-amber-300' },
      { label: 'Brokers', value: String(brokerCount), tone: 'text-emerald-300' }
    ];
  }, [trades]);

  const brokerStatementGroups = useMemo(() => {
    const groups = new Map<string, TradeRecord[]>();
    for (const trade of trades) {
      const broker = normalizeBroker(trade.broker);
      groups.set(broker, [...(groups.get(broker) ?? []), trade]);
    }

    return [...groups.entries()]
      .map(([broker, brokerTrades]) => ({
        broker,
        trades: brokerTrades,
        totalQuantity: brokerTrades.reduce((sum, trade) => sum + trade.quantity, 0),
        totalFees: brokerTrades.reduce((sum, trade) => sum + trade.fee, 0),
        buyCount: brokerTrades.filter((trade) => trade.type === 'BUY').length,
        sellCount: brokerTrades.filter((trade) => trade.type === 'SELL').length
      }))
      .sort((left, right) => left.broker.localeCompare(right.broker));
  }, [trades]);
  const statementIds = useMemo(
    () => ['all-brokers', ...brokerStatementGroups.map((group) => `broker:${group.broker}`)],
    [brokerStatementGroups]
  );

  const csvReadyRows = useMemo(() => csvPreviewRows.filter((row) => row.status === 'ready' && row.parsed), [csvPreviewRows]);
  const csvErrorRows = useMemo(() => csvPreviewRows.filter((row) => row.status === 'error'), [csvPreviewRows]);

  function updateForm<K extends keyof TradeFormState>(key: K, value: TradeFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm(preserveMessage = false) {
    setForm(createDefaultFormState());
    setEditingTradeId(null);
    setFormError(null);
    setHasSubmittedForm(false);
    if (!preserveMessage) {
      setFormMessage(null);
    }
    setLotsError(null);
    setAvailableLots([]);
    setPriceLookupError(null);
    setLatestPriceInfo(null);
  }

  async function handleLoadLatestPrice() {
    const ticker = form.ticker.trim().toUpperCase();
    if (ticker.length === 0) {
      setPriceLookupError('Enter a ticker before loading the current price.');
      setLatestPriceInfo(null);
      return;
    }

    try {
      setPriceLookupLoading(true);
      const response = await fetchLatestPrice(ticker);
      if (response.price == null) {
        setPriceLookupError(response.error ?? `Latest price is unavailable for ${response.ticker}.`);
        setLatestPriceInfo(null);
        return;
      }

      updateForm('price', String(response.price));
      setPriceLookupError(response.error);
      setLatestPriceInfo(
        `Loaded ${response.ticker} ${formatCurrency(response.price, form.currency || 'USD')} from ${response.provider} (${response.source}).`
      );
    } catch (error) {
      setPriceLookupError(error instanceof Error ? error.message : 'Unable to load current price');
      setLatestPriceInfo(null);
    } finally {
      setPriceLookupLoading(false);
    }
  }

  function resetCsvImport() {
    setCsvFileName(null);
    setCsvPreviewRows([]);
    setCsvError(null);
    setCsvMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleAddBrokerOption() {
    if (!canAddCurrentBroker) {
      return;
    }

    const nextOptions = [...customBrokerOptions, currentBrokerOption].sort((left, right) => left.localeCompare(right));
    setCustomBrokerOptions(nextOptions);
    persistCustomBrokerOptions(nextOptions);
    setFormMessage(`Added ${currentBrokerOption} to frequent brokers.`);
  }

  function handleRemoveBrokerOption(broker: string) {
    const confirmed = window.confirm(`Remove ${broker} from frequent brokers?`);
    if (!confirmed) {
      return;
    }

    const nextOptions = customBrokerOptions.filter((option) => option.toLowerCase() !== broker.toLowerCase());
    setCustomBrokerOptions(nextOptions);
    persistCustomBrokerOptions(nextOptions);
    if (form.broker.toLowerCase() === broker.toLowerCase()) {
      updateForm('broker', '');
    }
    setFormMessage(`Removed ${broker} from frequent brokers.`);
  }

  function startEdit(trade: TradeRecord) {
    const allocationMap = Object.fromEntries(trade.allocations.map((allocation) => [allocation.buyTradeId, String(allocation.quantity)]));

    setEditingTradeId(trade.id);
    setForm({
      broker: normalizeBroker(trade.broker),
      ticker: trade.ticker,
      tradeDate: trade.tradeDate,
      type: trade.type,
      quantity: String(trade.quantity),
      price: String(trade.price),
      fee: String(trade.fee),
      notes: trade.notes ?? '',
      currency: trade.currency,
      lotSelectionMethod: trade.type === 'SELL' ? trade.lotSelectionMethod : 'FIFO',
      allocations: trade.type === 'SELL' ? allocationMap : {}
    });
    setFormError(null);
    setFormMessage(null);
    setHasSubmittedForm(false);
    setIsTradeFormOpen(true);
    setPriceLookupError(null);
    setLatestPriceInfo(null);
  }

  async function handleDelete(id: number) {
    const confirmed = window.confirm('Delete this trade? This will also rebuild SELL allocations.');
    if (!confirmed) {
      return;
    }

    try {
      await deleteTrade(id);
      setSelectedTradeIds((current) => current.filter((tradeId) => tradeId !== id));
      if (editingTradeId === id) {
        resetForm();
      }
      await loadTrades();
      setTableMessage('Trade deleted.');
    } catch (error) {
      setTableError(error instanceof Error ? error.message : 'Failed to delete trade');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasSubmittedForm(true);

    if (validationErrors.length > 0) {
      setFormError(validationErrors[0]);
      return;
    }

    const payload: TradePayload = {
      broker: normalizeBroker(form.broker),
      ticker: form.ticker.trim().toUpperCase(),
      tradeDate: form.tradeDate,
      type: form.type,
      quantity,
      price,
      fee,
      notes: form.notes.trim().length > 0 ? form.notes.trim() : null,
      currency: form.currency.trim().toUpperCase() || 'USD'
    };

    if (form.type === 'SELL') {
      payload.lotSelectionMethod = form.lotSelectionMethod;
      if (form.lotSelectionMethod === 'SPECIFIC') {
        payload.allocations = allocationSummary.entries.map((entry) => ({
          buyTradeId: entry.row.buyTradeId,
          quantity: entry.quantity
        }));
      }
    }

    try {
      setIsSubmitting(true);
      setFormError(null);
      if (editingTradeId == null) {
        await createTrade(payload);
        setFormMessage('Trade created successfully.');
      } else {
        await updateTrade(editingTradeId, payload);
        setFormMessage('Trade updated successfully.');
      }
      await loadTrades();
      resetForm(true);
      setIsTradeFormOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to save trade');
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetJsonImport(preserveText = false) {
    if (!preserveText) {
      setJsonImportText('');
    }
    setJsonImportError(null);
    setJsonImportMessage(null);
  }

  function handleLoadJsonExample() {
    setJsonImportText(JSON_IMPORT_EXAMPLE);
    setJsonImportError(null);
    setJsonImportMessage('Loaded sample JSON payload. You can edit it before importing.');
  }

  function handleFormatJson() {
    try {
      const rows = parseJsonImportPayload(jsonImportText);
      setJsonImportText(JSON.stringify({ rows }, null, 2));
      setJsonImportError(null);
      setJsonImportMessage(`Formatted JSON payload with ${rows.length} row${rows.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setJsonImportError(error instanceof Error ? error.message : 'Unable to format JSON payload');
      setJsonImportMessage(null);
    }
  }

  function handlePreviewJson() {
    try {
      const rows = parseJsonImportPayload(jsonImportText);
      setJsonImportError(null);
      setJsonImportMessage(`JSON payload is valid with ${rows.length} row${rows.length === 1 ? '' : 's'} ready to import.`);
    } catch (error) {
      setJsonImportError(error instanceof Error ? error.message : 'Unable to preview JSON payload');
      setJsonImportMessage(null);
    }
  }

  async function handleJsonImport() {
    try {
      const rows = parseJsonImportPayload(jsonImportText);
      setIsImportingJson(true);
      const result = await importTrades(rows);
      await loadTrades();
      setJsonImportError(null);
      setJsonImportMessage(`Imported ${result.importedCount} trades successfully from JSON.`);
      setJsonImportText('');
    } catch (error) {
      setJsonImportError(error instanceof Error ? error.message : 'JSON import failed');
      setJsonImportMessage(null);
    } finally {
      setIsImportingJson(false);
    }
  }

  async function handleCsvFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsedCsv = parseCsv(text);
      const lowerHeaders = parsedCsv.headers.map((header) => header.trim().toLowerCase());
      const missingColumns = REQUIRED_CSV_COLUMNS.filter((column) => !lowerHeaders.includes(column.toLowerCase()));
      if (missingColumns.length > 0) {
        throw new Error(`Missing required CSV columns: ${missingColumns.join(', ')}`);
      }

      const previewRows = parsedCsv.rows.map((row, index) => buildCsvPreviewRow(row, index + 2));
      setCsvFileName(file.name);
      setCsvPreviewRows(previewRows);
      setCsvError(null);
      setCsvMessage(null);
    } catch (error) {
      setCsvFileName(file.name);
      setCsvPreviewRows([]);
      setCsvError(error instanceof Error ? error.message : 'Unable to parse CSV file');
      setCsvMessage(null);
    }
  }

  function openTradeDatePicker() {
    const input = tradeDateInputRef.current;
    if (!input) {
      return;
    }

    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }

    input.focus();
  }

  async function handleCsvImport() {
    if (csvReadyRows.length === 0 || csvErrorRows.length > 0) {
      return;
    }

    try {
      setIsImportingCsv(true);
      const result = await importTrades(csvReadyRows.map((row) => row.parsed as CsvTradeImportRow));
      await loadTrades();
      setCsvMessage(`Imported ${result.importedCount} trades successfully.`);
      setCsvError(null);
      setCsvPreviewRows([]);
      setCsvFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : 'CSV import failed');
    } finally {
      setIsImportingCsv(false);
    }
  }


  async function handleTradesExport() {
    try {
      setCsvError(null);
      await downloadTradesCsv();
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : 'Trades export failed');
    }
  }

  async function handleYearlyExport() {
    try {
      setCsvError(null);
      await downloadYearlySummaryCsv();
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : 'Yearly export failed');
    }
  }

  function toggleTradeSelection(id: number) {
    setSelectedTradeIds((current) => (
      current.includes(id)
        ? current.filter((tradeId) => tradeId !== id)
        : [...current, id]
    ));
  }

  function toggleTableSelection(tableTrades: TradeRecord[]) {
    const tableIds = tableTrades.map((trade) => trade.id);
    const allSelected = tableIds.length > 0 && tableIds.every((id) => selectedTradeIdSet.has(id));

    setSelectedTradeIds((current) => {
      if (allSelected) {
        return current.filter((id) => !tableIds.includes(id));
      }

      return [...new Set([...current, ...tableIds])];
    });
  }

  async function handleBulkDelete(ids: number[]) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(`Delete ${uniqueIds.length} selected trade${uniqueIds.length === 1 ? '' : 's'}? This will also rebuild SELL allocations.`);
    if (!confirmed) {
      return;
    }

    const selectedTrades = uniqueIds
      .map((id) => trades.find((trade) => trade.id === id))
      .filter((trade): trade is TradeRecord => Boolean(trade))
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === 'SELL' ? -1 : 1;
        }
        return right.tradeDate.localeCompare(left.tradeDate) || right.id - left.id;
      });

    try {
      setIsBulkDeleting(true);
      setTableError(null);
      setTableMessage(null);
      for (const trade of selectedTrades) {
        await deleteTrade(trade.id);
      }

      if (editingTradeId != null && uniqueIds.includes(editingTradeId)) {
        resetForm();
      }

      setSelectedTradeIds((current) => current.filter((id) => !uniqueIds.includes(id)));
      await loadTrades();
      setTableMessage(`Deleted ${selectedTrades.length} selected trade${selectedTrades.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setTableError(error instanceof Error ? error.message : 'Failed to delete selected trades');
    } finally {
      setIsBulkDeleting(false);
    }
  }

  function toggleStatement(statementId: string) {
    setExpandedStatementIds((current) => ({
      ...current,
      [statementId]: !(current[statementId] ?? false)
    }));
  }

  function expandAllStatements() {
    setExpandedStatementIds(Object.fromEntries(statementIds.map((statementId) => [statementId, true])));
  }

  function collapseBrokerStatements() {
    setExpandedStatementIds(Object.fromEntries(statementIds.map((statementId) => [statementId, statementId === 'all-brokers'])));
  }

  function renderTradeTable(
    title: string,
    tableTrades: TradeRecord[],
    options?: {
      emptyMessage?: string;
      showLoading?: boolean;
      summary?: string;
      statementId?: string;
      defaultExpanded?: boolean;
      metrics?: { label: string; value: string; tone?: string }[];
    }
  ) {
    const showLoading = options?.showLoading ?? false;
    const emptyMessage = options?.emptyMessage ?? 'No trades yet. Use the form on the right or import a CSV.';
    const tableIds = tableTrades.map((trade) => trade.id);
    const tableSelectedIds = tableIds.filter((id) => selectedTradeIdSet.has(id));
    const allTableRowsSelected = tableIds.length > 0 && tableSelectedIds.length === tableIds.length;
    const statementId = options?.statementId;
    const isExpanded = statementId == null ? true : expandedStatementIds[statementId] ?? options?.defaultExpanded ?? false;

    return (
      <section className="rounded-3xl border border-white/10 bg-white/5">
        <div className={`flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${isExpanded ? 'border-b border-white/10' : ''}`}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-base font-semibold text-white">{title}</h3>
              {statementId ? (
                <button
                  type="button"
                  onClick={() => toggleStatement(statementId)}
                  aria-expanded={isExpanded}
                  className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-emerald-300/40 hover:text-white"
                >
                  {isExpanded ? 'Collapse' : 'Expand'}
                </button>
              ) : null}
            </div>
            {options?.summary ? <p className="mt-1 text-sm text-slate-400">{options.summary}</p> : null}
            {options?.metrics?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {options.metrics.map((metric) => (
                  <span key={metric.label} className="rounded-full border border-white/10 bg-slate-950/45 px-3 py-1.5 text-xs font-medium text-slate-300">
                    {metric.label}: <span className={metric.tone ?? 'text-white'}>{metric.value}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300">
              {tableSelectedIds.length} selected
            </span>
            <button
              type="button"
              disabled={tableSelectedIds.length === 0 || isBulkDeleting}
              onClick={() => void handleBulkDelete(tableSelectedIds)}
              className="rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
            >
              {isBulkDeleting ? 'Deleting...' : 'Delete Selected'}
            </button>
          </div>
        </div>
        {isExpanded ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-white/10 bg-slate-950/40 text-left text-xs uppercase tracking-[0.22em] text-slate-400">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allTableRowsSelected}
                    disabled={tableIds.length === 0 || showLoading || isBulkDeleting}
                    onChange={() => toggleTableSelection(tableTrades)}
                    aria-label={`Select all rows in ${title}`}
                    className="h-4 w-4 rounded border-white/20 bg-slate-950 text-emerald-400"
                  />
                </th>
                <th className="px-4 py-3">Broker</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Ticker</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Fee</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {showLoading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-slate-400">Loading trades...</td>
                </tr>
              ) : tableTrades.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-slate-400">{emptyMessage}</td>
                </tr>
              ) : (
                tableTrades.map((trade) => (
                  <tr key={`${title}-${trade.id}`} className="border-b border-white/10 text-slate-200 last:border-b-0">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedTradeIdSet.has(trade.id)}
                        disabled={isBulkDeleting}
                        onChange={() => toggleTradeSelection(trade.id)}
                        aria-label={`Select trade ${trade.id}`}
                        className="h-4 w-4 rounded border-white/20 bg-slate-950 text-emerald-400"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200">{normalizeBroker(trade.broker)}</span>
                    </td>
                    <td className="px-4 py-4">{dayjs(trade.tradeDate).format('YYYY-MM-DD')}</td>
                    <td className="px-4 py-4 font-medium text-white">{trade.ticker}</td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${trade.type === 'BUY' ? 'bg-sky-400/15 text-sky-200' : 'bg-amber-400/15 text-amber-200'}`}>{trade.type}</span>
                    </td>
                    <td className="px-4 py-4"><span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-300">{formatMethodLabel(trade)}</span></td>
                    <td className="px-4 py-4">{formatQuantity(trade.quantity)}</td>
                    <td className="px-4 py-4">{formatCurrency(trade.price, trade.currency)}</td>
                    <td className="px-4 py-4">{formatCurrency(trade.fee, trade.currency)}</td>
                    <td className="max-w-[220px] px-4 py-4 text-slate-400">{trade.notes ?? 'No notes'}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => startEdit(trade)} className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-emerald-300/40 hover:text-white">Edit</button>
                        <button type="button" onClick={() => void handleDelete(trade.id)} className="rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <article key={card.label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">{card.label}</p>
            <p className={`mt-3 text-3xl font-semibold ${card.tone}`}>{card.value}</p>
          </article>
        ))}
      </div>

      <div className="space-y-6">
        <section className="space-y-4">
          <div className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Broker Statements</h2>
              <p className="mt-1 text-sm text-slate-400">All Brokers is the combined statement. Broker statements stay collapsed until you expand the ones you want to inspect.</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={expandAllStatements}
                className="rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 transition hover:text-white"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={collapseBrokerStatements}
                className="rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 transition hover:text-white"
              >
                Collapse Brokers
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setFormMessage('Ready to add a new trade.');
                  setIsTradeFormOpen(true);
                }}
                className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/20"
              >
                New Trade
              </button>
            </div>
          </div>

          {tableError ? (
            <div className="mx-5 mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{tableError}</div>
          ) : null}
          {tableMessage ? (
            <div className="mx-5 mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{tableMessage}</div>
          ) : null}

          {renderTradeTable('All Brokers Statement', trades, {
            statementId: 'all-brokers',
            defaultExpanded: true,
            showLoading: loading,
            summary: `${trades.length} total trades across ${brokerStatementGroups.length} broker${brokerStatementGroups.length === 1 ? '' : 's'}.`,
            metrics: [
              { label: 'Trades', value: String(trades.length), tone: 'text-emerald-300' },
              { label: 'Brokers', value: String(brokerStatementGroups.length), tone: 'text-sky-300' }
            ]
          })}

          {!loading && brokerStatementGroups.map((group) => (
            <div key={group.broker}>
              {renderTradeTable(`${group.broker} Statement`, group.trades, {
                statementId: `broker:${group.broker}`,
                summary: `${group.trades.length} trades, ${formatQuantity(group.totalQuantity)} total shares recorded.`,
                metrics: [
                  { label: 'Trades', value: String(group.trades.length), tone: 'text-emerald-300' },
                  { label: 'BUY / SELL', value: `${group.buyCount} / ${group.sellCount}`, tone: 'text-slate-100' },
                  { label: 'Fees', value: formatCurrency(group.totalFees), tone: 'text-amber-300' }
                ]
              })}
            </div>
          ))}
        </section>

        {isTradeFormOpen
          ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/85 px-4 py-6 backdrop-blur-sm">
              <section className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-3xl border border-white/10 bg-slate-950 p-5 shadow-2xl shadow-black/50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{editingTrade ? 'Edit Trade' : 'New Trade'}</h2>
              <p className="mt-1 text-sm text-slate-400">SELL orders can use FIFO auto allocation or Specific Lot selection with live allocation previews.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {editingTrade ? (
                <button type="button" onClick={() => resetForm()} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:text-white">Cancel Edit</button>
              ) : null}
              <button type="button" onClick={() => setIsTradeFormOpen(false)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:text-white">Close</button>
            </div>
          </div>

          {formMessage ? <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{formMessage}</div> : null}
          {formError ? <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{formError}</div> : null}
          {hasSubmittedForm && validationErrors.length > 1 ? (
            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <ul className="space-y-1">{validationErrors.map((error) => <li key={error}>{error}</li>)}</ul>
            </div>
          ) : null}

          <form className="mt-5 space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <span>Broker</span>
                  <button
                    type="button"
                    onClick={handleAddBrokerOption}
                    disabled={!canAddCurrentBroker}
                    className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                  >
                    Add to Frequent
                  </button>
                </div>
                <input
                  list="broker-options"
                  value={form.broker}
                  onChange={(event) => updateForm('broker', event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40"
                  placeholder="Select or type a broker"
                />
                <datalist id="broker-options">
                  {brokerOptions.map((broker) => (
                    <option key={broker} value={broker} />
                  ))}
                </datalist>
                <div className="flex flex-wrap gap-2">
                  {brokerOptions.map((broker) => {
                    const isCustom = customBrokerOptions.some((option) => option.toLowerCase() === broker.toLowerCase());
                    return (
                      <span
                        key={broker}
                        className={[
                          'inline-flex items-center overflow-hidden rounded-full border text-xs font-medium transition',
                          form.broker === broker
                            ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-100'
                            : 'border-white/10 bg-white/5 text-slate-300'
                        ].join(' ')}
                      >
                        <button
                          type="button"
                          onClick={() => updateForm('broker', broker)}
                          className="px-3 py-1.5 transition hover:bg-white/10 hover:text-white"
                        >
                          {broker}
                        </button>
                        {isCustom ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveBrokerOption(broker)}
                            className="mr-1 grid h-5 w-5 place-items-center rounded-full text-sm leading-none text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-100"
                            aria-label={`Remove ${broker} from frequent brokers`}
                            title={`Remove ${broker}`}
                          >
                            ×
                          </button>
                        ) : null}
                      </span>
                    );
                  })}
                </div>
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span>Ticker</span>
                <input value={form.ticker} onChange={(event) => { updateForm('ticker', event.target.value.toUpperCase()); setPriceLookupError(null); setLatestPriceInfo(null); }} className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40" placeholder="AAPL" />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-3">
                  <span>Trade Date</span>
                  <button
                    type="button"
                    onClick={openTradeDatePicker}
                    className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-400/20"
                  >
                    Open Calendar
                  </button>
                </div>
                <input
                  ref={tradeDateInputRef}
                  type="date"
                  value={form.tradeDate}
                  onChange={(event) => updateForm('tradeDate', event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span>Type</span>
                <select
                  value={form.type}
                  onChange={(event) => {
                    const nextType = event.target.value as TradeType;
                    setForm((current) => ({
                      ...current,
                      type: nextType,
                      lotSelectionMethod: nextType === 'SELL' ? current.lotSelectionMethod : 'FIFO',
                      allocations: nextType === 'SELL' ? current.allocations : {}
                    }));
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40"
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span>Currency</span>
                <input value={form.currency} onChange={(event) => updateForm('currency', event.target.value.toUpperCase())} className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40" placeholder="USD" />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span>Quantity</span>
                <input type="number" min="0" step="0.01" value={form.quantity} onChange={(event) => updateForm('quantity', event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40" />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-3">
                  <span>Price</span>
                  <button
                    type="button"
                    onClick={() => void handleLoadLatestPrice()}
                    disabled={priceLookupLoading || form.ticker.trim().length === 0}
                    className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                  >
                    {priceLookupLoading ? 'Loading...' : 'Use Current Price'}
                  </button>
                </div>
                <input type="number" min="0" step="0.01" value={form.price} onChange={(event) => updateForm('price', event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40" />
                {latestPriceInfo ? <span className="block text-xs text-emerald-300">{latestPriceInfo}</span> : null}
                {priceLookupError ? <span className="block text-xs text-rose-300">{priceLookupError}</span> : null}
              </label>
              <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
                <span>Fee</span>
                <input type="number" min="0" step="0.01" value={form.fee} onChange={(event) => updateForm('fee', event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40" />
              </label>
            </div>

            <label className="space-y-2 text-sm text-slate-300">
              <span>Notes</span>
              <textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} rows={3} className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40" placeholder="Execution notes, rationale, or broker reference" />
            </label>

            {isSell ? (
              <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/30 p-4">
                <div>
                  <h3 className="text-base font-semibold text-white">Lot Selection Method</h3>
                  <p className="mt-1 text-sm text-slate-400">Choose automatic FIFO matching or manually select the BUY lots for this SELL.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {(['FIFO', 'SPECIFIC'] as LotSelectionMethod[]).map((method) => {
                    const isActive = form.lotSelectionMethod === method;
                    return (
                      <button key={method} type="button" onClick={() => updateForm('lotSelectionMethod', method)} className={['rounded-2xl border px-4 py-4 text-left transition', isActive ? 'border-emerald-300/40 bg-emerald-400/10 text-white' : 'border-white/10 bg-white/5 text-slate-300'].join(' ')}>
                        <div className="font-medium">{method === 'FIFO' ? 'FIFO Auto Allocation' : 'Specific Lot Selection'}</div>
                        <div className="mt-2 text-sm text-slate-400">{method === 'FIFO' ? 'The backend will assign BUY lots automatically by trade date.' : 'You will choose exactly how much to allocate from each available BUY lot.'}</div>
                      </button>
                    );
                  })}
                </div>

                {form.lotSelectionMethod === 'FIFO' ? (
                  <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">FIFO mode is active. No manual allocation input is required; the backend will generate the allocations when you save.</div>
                ) : (
                  <div className="space-y-4">
                    {lotsError ? <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{lotsError}</div> : null}
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><p className="text-xs uppercase tracking-[0.22em] text-slate-500">Allocated Total</p><p className="mt-2 text-xl font-semibold text-white">{allocationSummary.allocatedTotal.toFixed(2)}</p></article>
                      <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><p className="text-xs uppercase tracking-[0.22em] text-slate-500">Remaining</p><p className={`mt-2 text-xl font-semibold ${Math.abs(allocationSummary.remainingQuantity) <= QUANTITY_EPSILON ? 'text-emerald-300' : 'text-amber-300'}`}>{allocationSummary.remainingQuantity.toFixed(2)}</p></article>
                      <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><p className="text-xs uppercase tracking-[0.22em] text-slate-500">Estimated Cost</p><p className="mt-2 text-xl font-semibold text-white">{formatCurrency(allocationSummary.estimatedCost, form.currency || 'USD')}</p></article>
                      <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><p className="text-xs uppercase tracking-[0.22em] text-slate-500">Estimated Realized</p><p className={`mt-2 text-xl font-semibold ${allocationSummary.estimatedRealizedPnL >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatCurrency(allocationSummary.estimatedRealizedPnL, form.currency || 'USD')}</p></article>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-950/40">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-slate-200">
                          <thead className="border-b border-white/10 text-left text-xs uppercase tracking-[0.22em] text-slate-400">
                            <tr>
                              <th className="px-4 py-3">Buy Trade Id</th>
                              <th className="px-4 py-3">Buy Trade Date</th>
                              <th className="px-4 py-3">Price</th>
                              <th className="px-4 py-3">Original Quantity</th>
                              <th className="px-4 py-3">Allocated Quantity</th>
                              <th className="px-4 py-3">Available Quantity</th>
                              <th className="px-4 py-3">Allocate Now</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lotsLoading ? (
                              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading available BUY lots...</td></tr>
                            ) : lotRows.length === 0 ? (
                              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No BUY lots available for this ticker and trade date.</td></tr>
                            ) : (
                              lotRows.map((row) => (
                                <tr key={row.buyTradeId} className="border-b border-white/10 last:border-b-0">
                                  <td className="px-4 py-3 font-medium text-white">#{row.buyTradeId}</td>
                                  <td className="px-4 py-3">{row.buyTradeDate ? dayjs(row.buyTradeDate).format('YYYY-MM-DD') : 'N/A'}</td>
                                  <td className="px-4 py-3">{row.buyPrice == null ? 'N/A' : formatCurrency(row.buyPrice, row.currency)}</td>
                                  <td className="px-4 py-3">{formatQuantity(row.originalQuantity)}</td>
                                  <td className="px-4 py-3">{formatQuantity(row.allocatedQuantity)}</td>
                                  <td className="px-4 py-3">{formatQuantity(row.editableAvailableQuantity)}</td>
                                  <td className="px-4 py-3"><input type="number" min="0" step="0.01" max={row.editableAvailableQuantity} value={form.allocations[row.buyTradeId] ?? ''} onChange={(event) => setForm((current) => ({ ...current, allocations: { ...current.allocations, [row.buyTradeId]: event.target.value } }))} className="w-28 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-white outline-none transition focus:border-emerald-300/40" placeholder="0.00" /></td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={isSubmitting || (isSpecific && lotsLoading)} className="rounded-full bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300">{isSubmitting ? 'Saving...' : editingTrade ? 'Update Trade' : 'Create Trade'}</button>
              <button type="button" onClick={() => resetForm()} className="rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:text-white">Reset</button>
            </div>
          </form>
              </section>
            </div>,
            document.body
          )
          : null}
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">CSV Import / Export</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Import trades with preview before commit. For SPECIFIC SELL rows, use an `allocations` JSON column and optionally an `importRef` column so allocations can reference BUY rows in the same file.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void handleCsvFileSelected(event)} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/20"
            >
              Upload CSV
            </button>
            <button
              type="button"
              onClick={() => void handleTradesExport()}
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 transition hover:text-white"
            >
              Export Trades CSV
            </button>
            <button
              type="button"
              onClick={() => void handleYearlyExport()}
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 transition hover:text-white"
            >
              Export Yearly CSV
            </button>
          </div>
        </div>

        {csvError ? (
          <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{csvError}</div>
        ) : null}
        {csvMessage ? (
          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{csvMessage}</div>
        ) : null}

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.72fr)_minmax(340px,0.28fr)]">
          <div className="rounded-2xl border border-white/10 bg-slate-950/35">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-white">Import Preview</p>
                <p className="mt-1 text-xs text-slate-500">{csvFileName ? `File: ${csvFileName}` : 'No CSV selected yet'}</p>
              </div>
              {csvPreviewRows.length > 0 ? (
                <button
                  type="button"
                  onClick={resetCsvImport}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:text-white"
                >
                  Clear Preview
                </button>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-slate-200">
                <thead className="border-b border-white/10 text-left text-xs uppercase tracking-[0.22em] text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Row</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Broker</th>
                    <th className="px-4 py-3">Ticker</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreviewRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                        Upload a CSV to preview parsed rows before import.
                      </td>
                    </tr>
                  ) : (
                    csvPreviewRows.map((row) => (
                      <tr key={row.rowNumber} className="border-b border-white/10 last:border-b-0">
                        <td className="px-4 py-3">{row.rowNumber}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.status === 'ready' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-rose-400/15 text-rose-200'}`}>
                            {row.status === 'ready' ? 'Ready' : 'Error'}
                          </span>
                        </td>
                        <td className="px-4 py-3">{normalizeBroker(row.parsed?.broker ?? getCsvField(row.source, 'broker'))}</td>
                        <td className="px-4 py-3">{(row.parsed?.ticker ?? getCsvField(row.source, 'ticker')) || 'N/A'}</td>
                        <td className="px-4 py-3">{(row.parsed?.tradeDate ?? getCsvField(row.source, 'tradeDate')) || 'N/A'}</td>
                        <td className="px-4 py-3">{(row.parsed?.type ?? getCsvField(row.source, 'type')) || 'N/A'}</td>
                        <td className="px-4 py-3">{(row.parsed?.lotSelectionMethod ?? getCsvField(row.source, 'lotSelectionMethod')) || 'FIFO'}</td>
                        <td className="px-4 py-3">{(row.parsed?.quantity?.toFixed(2) ?? getCsvField(row.source, 'quantity')) || 'N/A'}</td>
                        <td className="max-w-[280px] px-4 py-3 text-slate-400">{row.error ?? 'Ready to import'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <h3 className="text-base font-semibold text-white">Import Summary</h3>
            <div className="mt-4 grid gap-3">
              <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Ready Rows</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-300">{csvReadyRows.length}</p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Error Rows</p>
                <p className="mt-2 text-2xl font-semibold text-rose-300">{csvErrorRows.length}</p>
              </article>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              <p className="font-medium text-white">Allocations JSON Example</p>
              <code className="mt-2 block whitespace-pre-wrap text-xs text-emerald-200">[{`{"buyTradeRef":"AAPL-LOT-1","quantity":5}`}]</code>
            </div>
            <button
              type="button"
              disabled={csvReadyRows.length === 0 || csvErrorRows.length > 0 || isImportingCsv}
              onClick={() => void handleCsvImport()}
              className="mt-4 w-full rounded-full bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
            >
              {isImportingCsv ? 'Importing...' : 'Import Ready Rows'}
            </button>
          </aside>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-white">JSON Editor Import</p>
              <p className="mt-1 text-sm text-slate-400">Open a large modal editor to paste, tweak, preview, and import trade JSON directly without squeezing the payload into the page layout.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setIsJsonEditorOpen(true)}
                className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
              >
                Open JSON Editor
              </button>
              <button
                type="button"
                onClick={handleLoadJsonExample}
                className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/20"
              >
                Load JSON Example
              </button>
            </div>
          </div>

          {jsonImportError ? (
            <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{jsonImportError}</div>
          ) : null}
          {jsonImportMessage ? (
            <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{jsonImportMessage}</div>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)]">
            <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Current Payload</p>
              <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-slate-200">
                  {jsonImportText.trim().length > 0 ? jsonImportText : 'No JSON payload loaded yet.'}
                </pre>
              </div>
            </div>

            <aside className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
              <h3 className="text-base font-semibold text-white">JSON Notes</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <p>Accepted shapes:</p>
                <code className="block whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-emerald-200">[{`{"ticker":"AAPL",...}`}]</code>
                <code className="block whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-emerald-200">{`{"rows":[{"ticker":"AAPL",...}]}`}</code>
                <p>For SPECIFIC SELL imports, allocations can use either buyTradeId or buyTradeRef.</p>
                <p>Use the modal editor when you need full-screen editing space for larger import payloads.</p>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {isJsonEditorOpen
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 px-4 py-6 backdrop-blur-sm">
              <div
                className="flex h-[min(92vh,920px)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/50"
              >
                <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <h3 className="text-xl font-semibold text-white">JSON Editor Import</h3>
                    <p className="mt-1 text-sm text-slate-400">Edit trade rows in a larger workspace, preview the payload, then import directly into your ledger.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleLoadJsonExample}
                      className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-400/20"
                    >
                      Load JSON Example
                    </button>
                    <button
                      type="button"
                      onClick={handleFormatJson}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:text-white"
                    >
                      Format JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => resetJsonImport()}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:text-white"
                    >
                      Clear JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsJsonEditorOpen(false)}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:text-white"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-5 xl:grid-cols-[minmax(0,0.78fr)_minmax(300px,0.22fr)]">
                  <div className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                    {jsonImportError ? (
                      <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{jsonImportError}</div>
                    ) : null}
                    {jsonImportMessage ? (
                      <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{jsonImportMessage}</div>
                    ) : null}

                    <label className="mt-4 flex min-h-0 flex-1 flex-col space-y-2 text-sm text-slate-300">
                      <span>JSON Payload</span>
                      <textarea
                        value={jsonImportText}
                        onChange={(event) => {
                          setJsonImportText(event.target.value);
                          if (jsonImportError) {
                            setJsonImportError(null);
                          }
                          if (jsonImportMessage) {
                            setJsonImportMessage(null);
                          }
                        }}
                        rows={28}
                        placeholder='Paste {"rows":[...]} or [...] here'
                        className="min-h-0 flex-1 resize-none rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-emerald-300/40"
                      />
                    </label>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handlePreviewJson}
                        className="rounded-full border border-sky-300/30 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20"
                      >
                        Preview JSON
                      </button>
                      <button
                        type="button"
                        disabled={isImportingJson}
                        onClick={() => void handleJsonImport()}
                        className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
                      >
                        {isImportingJson ? 'Importing JSON...' : 'Import JSON Rows'}
                      </button>
                    </div>
                  </div>

                  <aside className="overflow-auto rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                    <h3 className="text-base font-semibold text-white">JSON Notes</h3>
                    <div className="mt-4 space-y-3 text-sm text-slate-300">
                      <p>Accepted shapes:</p>
                      <code className="block whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-emerald-200">[{`{"ticker":"AAPL",...}`}]</code>
                      <code className="block whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-emerald-200">{`{"rows":[{"ticker":"AAPL",...}]}`}</code>
                      <p>Each row uses the same server-side validation as CSV import.</p>
                      <p>For SPECIFIC SELL imports, allocations can use either buyTradeId or buyTradeRef.</p>
                      <p>Load the sample payload if you want a quick starting point with BUY and SPECIFIC SELL rows.</p>
                    </div>
                  </aside>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </section>
  );
}
