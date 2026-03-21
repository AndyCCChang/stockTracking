import {
  clearAllTrades,
  deleteTradeRow,
  getAllTradeAllocations,
  getAllTrades,
  getTradeById,
  insertTrade,
  listTrades,
  replaceAllAllocations,
  runInTransaction,
  updateTradeRow
} from './db/tradeRepository.js';
import { NotFoundError, ValidationError } from './lib/errors.js';
import { toCsv } from './lib/csv.js';
import { buildAllocationPlan, getOpenLots } from './lib/fifo.js';
import { validateTradeInput } from './lib/validation.js';
import type {
  CsvTradeImportResult,
  CsvTradeImportRow,
  TradeFilters,
  TradeInput,
  TradeLotAllocationInput,
  TradeRecord
} from './types.js';

function rebuildAllocations(overrides: Map<number, TradeLotAllocationInput[] | undefined> = new Map()) {
  const trades = getAllTrades();
  const existingAllocations = getAllTradeAllocations();
  const plannedAllocations = buildAllocationPlan(trades, existingAllocations, overrides);
  replaceAllAllocations(plannedAllocations);
}

function createTradeInCurrentTransaction(input: TradeInput) {
  const tradeId = insertTrade(input);
  const overrides = new Map<number, TradeLotAllocationInput[] | undefined>();
  if (input.type === 'SELL' && input.lotSelectionMethod === 'SPECIFIC') {
    overrides.set(tradeId, input.allocations ?? []);
  }

  rebuildAllocations(overrides);
  const trade = getTradeById(tradeId);
  if (!trade) {
    throw new NotFoundError(`Trade ${tradeId} not found after creation`);
  }

  return trade;
}

function updateTradeInCurrentTransaction(id: number, input: TradeInput) {
  const existing = getTradeById(id);
  if (!existing) {
    throw new NotFoundError(`Trade ${id} not found`);
  }

  updateTradeRow(id, input);
  const overrides = new Map<number, TradeLotAllocationInput[] | undefined>();
  if (input.type === 'SELL' && input.lotSelectionMethod === 'SPECIFIC') {
    overrides.set(id, input.allocations ?? []);
  }

  rebuildAllocations(overrides);
  const trade = getTradeById(id);
  if (!trade) {
    throw new NotFoundError(`Trade ${id} not found after update`);
  }

  return trade;
}

function resolveCsvTradeInput(row: CsvTradeImportRow, importRefMap: Map<string, number>) {
  const allocations = row.allocations?.map((allocation) => {
    if (allocation.buyTradeId != null) {
      return {
        buyTradeId: allocation.buyTradeId,
        quantity: allocation.quantity
      };
    }

    if (allocation.buyTradeRef) {
      const resolvedId = importRefMap.get(allocation.buyTradeRef);
      if (!resolvedId) {
        throw new ValidationError(`Unable to resolve buyTradeRef '${allocation.buyTradeRef}'. Referenced BUY rows must appear earlier in the CSV import.`);
      }

      return {
        buyTradeId: resolvedId,
        quantity: allocation.quantity
      };
    }

    throw new ValidationError('CSV allocation requires buyTradeId or buyTradeRef');
  });

  return validateTradeInput({
    ticker: row.ticker,
    tradeDate: row.tradeDate,
    type: row.type,
    quantity: row.quantity,
    price: row.price,
    fee: row.fee,
    notes: row.notes,
    currency: row.currency,
    lotSelectionMethod: row.lotSelectionMethod,
    allocations
  });
}

function buildAllocationExportSummary(trade: TradeRecord) {
  if (trade.type !== 'SELL' || trade.allocations.length === 0) {
    return '';
  }

  return JSON.stringify(
    trade.allocations.map((allocation) => ({
      buyTradeId: allocation.buyTradeId,
      quantity: allocation.quantity,
      buyTradeDate: allocation.buyTradeDateSnapshot,
      buyPrice: allocation.buyPriceSnapshot
    }))
  );
}

export function getTrades(filters: TradeFilters) {
  return listTrades(filters);
}

export function createTradeWithValidation(input: TradeInput) {
  return runInTransaction(() => createTradeInCurrentTransaction(input));
}

export function updateTradeWithValidation(id: number, input: TradeInput) {
  return runInTransaction(() => updateTradeInCurrentTransaction(id, input));
}

export function deleteTradeWithValidation(id: number) {
  runInTransaction(() => {
    const existing = getTradeById(id);
    if (!existing) {
      throw new NotFoundError(`Trade ${id} not found`);
    }

    deleteTradeRow(id);
    rebuildAllocations();
  });
}

export function importTradesWithValidation(rows: CsvTradeImportRow[]): CsvTradeImportResult {
  return runInTransaction(() => {
    const importRefMap = new Map<string, number>();
    const importedTradeIds: number[] = [];

    for (const row of rows) {
      if (row.importRef && importRefMap.has(row.importRef)) {
        throw new ValidationError(`Duplicate importRef '${row.importRef}' found in CSV import payload`);
      }

      const input = resolveCsvTradeInput(row, importRefMap);
      const trade = createTradeInCurrentTransaction(input);
      importedTradeIds.push(trade.id);
      if (row.importRef) {
        importRefMap.set(row.importRef, trade.id);
      }
    }

    return {
      importedCount: importedTradeIds.length,
      importedTradeIds
    };
  });
}

export function exportTradesAsCsv() {
  const trades = getAllTrades();
  return toCsv(
    ['id', 'ticker', 'tradeDate', 'type', 'quantity', 'price', 'fee', 'notes', 'currency', 'lotSelectionMethod', 'allocations'],
    trades.map((trade) => ({
      id: trade.id,
      ticker: trade.ticker,
      tradeDate: trade.tradeDate,
      type: trade.type,
      quantity: trade.quantity,
      price: trade.price,
      fee: trade.fee,
      notes: trade.notes ?? '',
      currency: trade.currency,
      lotSelectionMethod: trade.lotSelectionMethod,
      allocations: buildAllocationExportSummary(trade)
    }))
  );
}

export function getAvailableLotsForTrade(ticker: string, tradeDate: string) {
  return getOpenLots(getAllTrades(), getAllTradeAllocations(), { ticker, tradeDate });
}

export function resetTrades() {
  clearAllTrades();
}
