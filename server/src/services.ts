import type { Queryable } from './db/database.js';
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

async function assertTradeOwnership(userId: number, tradeId: number, db?: Queryable) {
  const ownerId = await getTradeOwnerId(tradeId, db);
  if (ownerId == null) {
    throw new NotFoundError(`Trade ${tradeId} not found`);
  }

  if (ownerId !== userId) {
    throw new ForbiddenError('You do not have access to this trade');
  }
}

async function assertAllocationOwnership(userId: number, input: TradeInput, db?: Queryable) {
  if (input.type !== 'SELL' || input.lotSelectionMethod !== 'SPECIFIC') {
    return;
  }

  for (const allocation of input.allocations ?? []) {
    const ownerId = await getTradeOwnerId(allocation.buyTradeId, db);
    if (ownerId != null && ownerId !== userId) {
      throw new ForbiddenError(`BUY lot ${allocation.buyTradeId} belongs to another user`);
    }
  }
}

async function rebuildAllocations(userId: number, overrides: Map<number, TradeLotAllocationInput[] | undefined> = new Map(), db?: Queryable) {
  const trades = await getAllTrades(userId, db);
  const existingAllocations = await getAllTradeAllocations(userId, db);
  const plannedAllocations = buildAllocationPlan(trades, existingAllocations, overrides);
  await replaceAllAllocations(userId, plannedAllocations, db);
}

async function createTradeInCurrentTransaction(userId: number, input: TradeInput, db: Queryable) {
  await assertAllocationOwnership(userId, input, db);
  const tradeId = await insertTrade(userId, input, db);
  const overrides = new Map<number, TradeLotAllocationInput[] | undefined>();
  if (input.type === 'SELL' && input.lotSelectionMethod === 'SPECIFIC') {
    overrides.set(tradeId, input.allocations ?? []);
  }

  await rebuildAllocations(userId, overrides, db);
  const trade = await getTradeById(userId, tradeId, db);
  if (!trade) {
    throw new NotFoundError(`Trade ${tradeId} not found after creation`);
  }

  return trade;
}

async function updateTradeInCurrentTransaction(userId: number, id: number, input: TradeInput, db: Queryable) {
  await assertTradeOwnership(userId, id, db);
  await assertAllocationOwnership(userId, input, db);

  await updateTradeRow(id, input, db);
  const overrides = new Map<number, TradeLotAllocationInput[] | undefined>();
  if (input.type === 'SELL' && input.lotSelectionMethod === 'SPECIFIC') {
    overrides.set(id, input.allocations ?? []);
  }

  await rebuildAllocations(userId, overrides, db);
  const trade = await getTradeById(userId, id, db);
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

export async function getTrades(userId: number, filters: TradeFilters) {
  return listTrades(userId, filters);
}

export async function createTradeWithValidation(userId: number, input: TradeInput) {
  return runInTransaction((db) => createTradeInCurrentTransaction(userId, input, db));
}

export async function updateTradeWithValidation(userId: number, id: number, input: TradeInput) {
  return runInTransaction((db) => updateTradeInCurrentTransaction(userId, id, input, db));
}

export async function deleteTradeWithValidation(userId: number, id: number) {
  await runInTransaction(async (db) => {
    await assertTradeOwnership(userId, id, db);
    await deleteTradeRow(id, db);
    await rebuildAllocations(userId, new Map(), db);
  });
}

export async function importTradesWithValidation(userId: number, rows: CsvTradeImportRow[]): Promise<CsvTradeImportResult> {
  return runInTransaction(async (db) => {
    const importRefMap = new Map<string, number>();
    const importedTradeIds: number[] = [];

    for (const row of rows) {
      if (row.importRef && importRefMap.has(row.importRef)) {
        throw new ValidationError(`Duplicate importRef '${row.importRef}' found in CSV import payload`);
      }

      const input = resolveCsvTradeInput(row, importRefMap);
      const trade = await createTradeInCurrentTransaction(userId, input, db);
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

export async function exportTradesAsCsv(userId: number) {
  const trades = await getAllTrades(userId);
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

export async function getAvailableLotsForTrade(userId: number, ticker: string, tradeDate: string) {
  const [trades, allocations] = await Promise.all([getAllTrades(userId), getAllTradeAllocations(userId)]);
  return getOpenLots(trades, allocations, { ticker, tradeDate });
}

export async function resetTrades() {
  await clearAllData();
}
