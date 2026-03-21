import dayjs from 'dayjs';
import { ValidationError } from './errors.js';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  LOT_SELECTION_METHODS,
  MAX_PAGE_SIZE,
  TRADE_SORT_FIELDS,
  TRADE_TYPES,
  type CsvTradeAllocationInput,
  type CsvTradeImportRow,
  type LotSelectionMethod,
  type SortOrder,
  type TradeFilters,
  type TradeInput,
  type TradeLotAllocationInput,
  type TradeSortField,
  type TradeType
} from '../types.js';

function isValidDate(value: string) {
  return Number.isFinite(Date.parse(value));
}

function toPositiveNumber(value: unknown, field: string) {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new ValidationError(`${field} must be greater than 0`);
  }

  return numericValue;
}

function toNonNegativeNumber(value: unknown, field: string) {
  const numericValue = value == null || value === '' ? 0 : typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new ValidationError(`${field} must be greater than or equal to 0`);
  }

  return numericValue;
}

function normalizeTicker(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError('ticker is required');
  }

  return value.trim().toUpperCase();
}

function toTradeType(value: unknown): TradeType {
  if (typeof value !== 'string') {
    throw new ValidationError('type is required');
  }

  const normalized = value.toUpperCase();
  if (!TRADE_TYPES.includes(normalized as TradeType)) {
    throw new ValidationError("type must be one of 'BUY' or 'SELL'");
  }

  return normalized as TradeType;
}

function toLotSelectionMethod(value: unknown, tradeType: TradeType): LotSelectionMethod {
  if (tradeType === 'BUY') {
    return 'FIFO';
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'FIFO';
  }

  const normalized = value.toUpperCase();
  if (!LOT_SELECTION_METHODS.includes(normalized as LotSelectionMethod)) {
    throw new ValidationError("lotSelectionMethod must be 'FIFO' or 'SPECIFIC'");
  }

  return normalized as LotSelectionMethod;
}

function validateAllocationInput(value: unknown): TradeLotAllocationInput {
  if (!value || typeof value !== 'object') {
    throw new ValidationError('Each allocation must be an object');
  }

  const input = value as Record<string, unknown>;
  const buyTradeId = Number.parseInt(String(input.buyTradeId), 10);
  if (!Number.isInteger(buyTradeId) || buyTradeId <= 0) {
    throw new ValidationError('allocation.buyTradeId must be a positive integer');
  }

  return {
    buyTradeId,
    quantity: toPositiveNumber(input.quantity, 'allocation.quantity')
  };
}

function validateCsvAllocationInput(value: unknown): CsvTradeAllocationInput {
  if (!value || typeof value !== 'object') {
    throw new ValidationError('Each CSV allocation must be an object');
  }

  const input = value as Record<string, unknown>;
  const buyTradeId = input.buyTradeId == null || input.buyTradeId === '' ? undefined : Number.parseInt(String(input.buyTradeId), 10);
  const buyTradeRef = typeof input.buyTradeRef === 'string' && input.buyTradeRef.trim().length > 0 ? input.buyTradeRef.trim() : undefined;

  if ((buyTradeId == null || !Number.isInteger(buyTradeId) || buyTradeId <= 0) && !buyTradeRef) {
    throw new ValidationError('CSV allocation requires buyTradeId or buyTradeRef');
  }

  return {
    buyTradeId: buyTradeId && buyTradeId > 0 ? buyTradeId : undefined,
    buyTradeRef,
    quantity: toPositiveNumber(input.quantity, 'allocation.quantity')
  };
}

export function validateTradeInput(payload: unknown): TradeInput {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Invalid request body');
  }

  const input = payload as Record<string, unknown>;
  const tradeType = toTradeType(input.type);
  const tradeDate = typeof input.tradeDate === 'string' ? input.tradeDate.trim() : '';
  if (!tradeDate || !isValidDate(tradeDate)) {
    throw new ValidationError('tradeDate must be a valid date');
  }

  const lotSelectionMethod = toLotSelectionMethod(input.lotSelectionMethod, tradeType);
  const allocations = Array.isArray(input.allocations) ? input.allocations.map(validateAllocationInput) : undefined;

  if (tradeType === 'SELL' && lotSelectionMethod === 'SPECIFIC' && (!allocations || allocations.length === 0)) {
    throw new ValidationError('allocations are required when lotSelectionMethod is SPECIFIC');
  }

  return {
    ticker: normalizeTicker(input.ticker),
    tradeDate,
    type: tradeType,
    quantity: toPositiveNumber(input.quantity, 'quantity'),
    price: toPositiveNumber(input.price, 'price'),
    fee: toNonNegativeNumber(input.fee, 'fee'),
    notes: typeof input.notes === 'string' ? input.notes.trim() : input.notes == null ? null : String(input.notes),
    currency: typeof input.currency === 'string' && input.currency.trim() ? input.currency.trim().toUpperCase() : 'USD',
    lotSelectionMethod,
    allocations: tradeType === 'SELL' ? allocations : []
  };
}

export function validateTradeImportRows(payload: unknown): CsvTradeImportRow[] {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Invalid import payload');
  }

  const input = payload as Record<string, unknown>;
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    throw new ValidationError('rows must be a non-empty array');
  }

  return input.rows.map((row, index) => {
    if (!row || typeof row !== 'object') {
      throw new ValidationError(`Import row ${index + 1} is invalid`);
    }

    const record = row as Record<string, unknown>;
    const tradeType = toTradeType(record.type);
    const tradeDate = typeof record.tradeDate === 'string' ? record.tradeDate.trim() : '';
    if (!tradeDate || !isValidDate(tradeDate)) {
      throw new ValidationError(`Import row ${index + 1}: tradeDate must be a valid date`);
    }

    const lotSelectionMethod = toLotSelectionMethod(record.lotSelectionMethod, tradeType);
    const allocations = Array.isArray(record.allocations) ? record.allocations.map(validateCsvAllocationInput) : undefined;
    if (tradeType === 'SELL' && lotSelectionMethod === 'SPECIFIC' && (!allocations || allocations.length === 0)) {
      throw new ValidationError(`Import row ${index + 1}: allocations are required when lotSelectionMethod is SPECIFIC`);
    }

    return {
      importRef: typeof record.importRef === 'string' && record.importRef.trim().length > 0 ? record.importRef.trim() : undefined,
      ticker: normalizeTicker(record.ticker),
      tradeDate,
      type: tradeType,
      quantity: toPositiveNumber(record.quantity, `Import row ${index + 1} quantity`),
      price: toPositiveNumber(record.price, `Import row ${index + 1} price`),
      fee: toNonNegativeNumber(record.fee, `Import row ${index + 1} fee`),
      notes: typeof record.notes === 'string' ? record.notes.trim() : record.notes == null ? null : String(record.notes),
      currency: typeof record.currency === 'string' && record.currency.trim() ? record.currency.trim().toUpperCase() : 'USD',
      lotSelectionMethod,
      allocations: tradeType === 'SELL' ? allocations : []
    } satisfies CsvTradeImportRow;
  });
}

function parsePositiveInteger(value: string | undefined, fallback: number, field: string) {
  if (value == null || value === '') {
    return fallback;
  }

  const numericValue = Number.parseInt(value, 10);
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    throw new ValidationError(`${field} must be a positive integer`);
  }

  return numericValue;
}

function parseSortField(value: string | undefined): TradeSortField {
  if (!value) {
    return 'tradeDate';
  }

  if (!TRADE_SORT_FIELDS.includes(value as TradeSortField)) {
    throw new ValidationError(`sortBy must be one of: ${TRADE_SORT_FIELDS.join(', ')}`);
  }

  return value as TradeSortField;
}

function parseSortOrder(value: string | undefined): SortOrder {
  if (!value) {
    return 'desc';
  }

  const normalized = value.toLowerCase();
  if (normalized !== 'asc' && normalized !== 'desc') {
    throw new ValidationError("sortOrder must be 'asc' or 'desc'");
  }

  return normalized;
}

export function validateTradeFilters(query: Record<string, string | undefined>): TradeFilters {
  const ticker = query.ticker?.trim().toUpperCase();
  const type = query.type ? toTradeType(query.type) : undefined;
  const startDate = query.startDate?.trim();
  const endDate = query.endDate?.trim();

  if (startDate && !isValidDate(startDate)) {
    throw new ValidationError('startDate must be a valid date');
  }

  if (endDate && !isValidDate(endDate)) {
    throw new ValidationError('endDate must be a valid date');
  }

  return {
    ticker: ticker || undefined,
    type,
    startDate,
    endDate,
    page: parsePositiveInteger(query.page, DEFAULT_PAGE, 'page'),
    pageSize: Math.min(parsePositiveInteger(query.pageSize, DEFAULT_PAGE_SIZE, 'pageSize'), MAX_PAGE_SIZE),
    sortBy: parseSortField(query.sortBy),
    sortOrder: parseSortOrder(query.sortOrder)
  };
}

export function validateTradeId(value: string) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Trade id must be a positive integer');
  }

  return id;
}

export function validateSummaryYear(value: string | undefined) {
  if (!value) {
    throw new ValidationError('year query parameter is required');
  }

  if (!/^\d{4}$/.test(value)) {
    throw new ValidationError('year must be a 4-digit year');
  }

  const parsed = dayjs(`${value}-01-01`);
  if (!parsed.isValid()) {
    throw new ValidationError('year must be a valid calendar year');
  }

  return value;
}

export function validateAvailableLotsQuery(query: Record<string, string | undefined>) {
  const ticker = normalizeTicker(query.ticker);
  const tradeDate = query.tradeDate?.trim() ?? '';
  if (!tradeDate || !isValidDate(tradeDate)) {
    throw new ValidationError('tradeDate must be a valid date');
  }

  return { ticker, tradeDate };
}
