import {
  clearAllData,
  deleteTradeRow,
  getAllTradeAllocations,
  getAllTrades,
  getTradeById,
  getTradeOwnerId,
  insertTrade,
  listTrades,
  replaceAllAllocations,
  runInTransaction,
  updateTradeRow
} from './db/tradeRepository.js';
import { ForbiddenError, NotFoundError, ValidationError } from './lib/errors.js';
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

function assertTradeOwnership(userId: number, tradeId: number) {
  const ownerId = getTradeOwnerId(tradeId);
  if (ownerId == null) {
    throw new NotFoundError(`Trade ${tradeId} not found`);
  }

  if (ownerId !== userId) {
    throw new ForbiddenError('You do not have access to this trade');
  }
}

function assertAllocationOwnership(userId: number, input: TradeInput) {
  if (input.type !== 'SELL' || input.lotSelectionMethod !== 'SPECIFIC') {
    return;
  }

  for (const allocation of input.allocations ?? []) {
    const ownerId = getTradeOwnerId(allocation.buyTradeId);
    if (ownerId != null && ownerId !== userId) {
      throw new ForbiddenError(`BUY lot ${allocation.buyTradeId} belongs to another user`);
    }
  }
}

function rebuildAllocations(userId: number, overrides: Map<number, TradeLotAllocationInput[] | undefined> = new Map()) {
  const trades = getAllTrades(userId);
  const existingAllocations = getAllTradeAllocations(userId);
  const plannedAllocations = buildAllocationPlan(trades, existingAllocations, overrides);
  replaceAllAllocations(userId, plannedAllocations);
}

function createTradeInCurrentTransaction(userId: number, input: TradeInput) {
  assertAllocationOwnership(userId, input);
  const tradeId = insertTrade(userId, input);
  const overrides = new Map<number, TradeLotAllocationInput[] | undefined>();
  if (input.type === 'SELL' && input.lotSelectionMethod === 'SPECIFIC') {
    overrides.set(tradeId, input.allocations ?? []);
  }

  rebuildAllocations(userId, overrides);
  const trade = getTradeById(userId, tradeId);
  if (!trade) {
    throw new NotFoundError(`Trade ${tradeId} not found after creation`);
  }

  return trade;
}

function updateTradeInCurrentTransaction(userId: number, id: number, input: TradeInput) {
  assertTradeOwnership(userId, id);
  assertAllocationOwnership(userId, input);

  updateTradeRow(id, input);
  const overrides = new Map<number, TradeLotAllocationInput[] | undefined>();
  if (input.type === 'SELL' && input.lotSelectionMethod === 'SPECIFIC') {
    overrides.set(id, input.allocations ?? []);
  }

  rebuildAllocations(userId, overrides);
  const trade = getTradeById(userId, id);
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

export function getTrades(userId: number, filters: TradeFilters) {
  return listTrades(userId, filters);
}

export function createTradeWithValidation(userId: number, input: TradeInput) {
  return runInTransaction(() => createTradeInCurrentTransaction(userId, input));
}

export function updateTradeWithValidation(userId: number, id: number, input: TradeInput) {
  return runInTransaction(() => updateTradeInCurrentTransaction(userId, id, input));
}

export function deleteTradeWithValidation(userId: number, id: number) {
  runInTransaction(() => {
    assertTradeOwnership(userId, id);
    deleteTradeRow(id);
    rebuildAllocations(userId);
  });
}

export function importTradesWithValidation(userId: number, rows: CsvTradeImportRow[]): CsvTradeImportResult {
  return runInTransaction(() => {
    const importRefMap = new Map<string, number>();
    const importedTradeIds: number[] = [];

    for (const row of rows) {
      if (row.importRef && importRefMap.has(row.importRef)) {
        throw new ValidationError(`Duplicate importRef '${row.importRef}' found in CSV import payload`);
      }

      const input = resolveCsvTradeInput(row, importRefMap);
      const trade = createTradeInCurrentTransaction(userId, input);
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

export function exportTradesAsCsv(userId: number) {
  const trades = getAllTrades(userId);
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

export function getAvailableLotsForTrade(userId: number, ticker: string, tradeDate: string) {
  return getOpenLots(getAllTrades(userId), getAllTradeAllocations(userId), { ticker, tradeDate });
}

export function resetTrades() {
  clearAllData();
}
