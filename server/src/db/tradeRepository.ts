import { db } from './database.js';
import type {
  LotSelectionMethod,
  TradeFilters,
  TradeInput,
  TradeListResult,
  TradeLotAllocationInput,
  TradeLotAllocationRecord,
  TradeRecord,
  TradeSortField
} from '../types.js';

const sortColumnMap: Record<TradeSortField, string> = {
  id: 'id',
  ticker: 'ticker',
  tradeDate: 'tradeDate',
  type: 'type',
  quantity: 'quantity',
  price: 'price',
  fee: 'fee',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

type TradeRow = Omit<TradeRecord, 'allocations'>;
type AllocationRow = TradeLotAllocationRecord;

type PersistedAllocationInput = TradeLotAllocationInput & {
  sellTradeId: number;
  buyPriceSnapshot?: number | null;
  buyTradeDateSnapshot?: string | null;
};

function mapTradeRow(row: TradeRow): TradeRecord {
  return {
    ...row,
    quantity: Number(row.quantity),
    price: Number(row.price),
    fee: Number(row.fee),
    lotSelectionMethod: row.lotSelectionMethod as LotSelectionMethod,
    allocations: []
  };
}

function mapAllocationRow(row: AllocationRow): TradeLotAllocationRecord {
  return {
    ...row,
    quantity: Number(row.quantity),
    buyPriceSnapshot: row.buyPriceSnapshot == null ? null : Number(row.buyPriceSnapshot)
  };
}

function getAllocationsBySellIds(sellTradeIds: number[]) {
  if (sellTradeIds.length === 0) {
    return new Map<number, TradeLotAllocationRecord[]>();
  }

  const placeholders = sellTradeIds.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT * FROM trade_lot_allocations WHERE sellTradeId IN (${placeholders}) ORDER BY id ASC`
  ).all(...sellTradeIds) as AllocationRow[];

  const allocationMap = new Map<number, TradeLotAllocationRecord[]>();
  for (const row of rows.map(mapAllocationRow)) {
    const current = allocationMap.get(row.sellTradeId) ?? [];
    current.push(row);
    allocationMap.set(row.sellTradeId, current);
  }

  return allocationMap;
}

function enrichTrades(rows: TradeRow[]) {
  const trades = rows.map(mapTradeRow);
  const allocationMap = getAllocationsBySellIds(trades.map((trade) => trade.id));
  return trades.map((trade) => ({
    ...trade,
    allocations: allocationMap.get(trade.id) ?? []
  }));
}

export function listTrades(filters: TradeFilters): TradeListResult {
  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (filters.ticker) {
    conditions.push('ticker = ?');
    values.push(filters.ticker);
  }

  if (filters.type) {
    conditions.push('type = ?');
    values.push(filters.type);
  }

  if (filters.startDate) {
    conditions.push('tradeDate >= ?');
    values.push(filters.startDate);
  }

  if (filters.endDate) {
    conditions.push('tradeDate <= ?');
    values.push(filters.endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalItemsRow = db.prepare(`SELECT COUNT(*) as count FROM trades ${whereClause}`).get(...values) as { count: number };
  const totalItems = Number(totalItemsRow.count);
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / filters.pageSize);
  const offset = (filters.page - 1) * filters.pageSize;
  const sortColumn = sortColumnMap[filters.sortBy];
  const sortOrder = filters.sortOrder.toUpperCase();

  const rows = db.prepare(
    `SELECT * FROM trades ${whereClause} ORDER BY ${sortColumn} ${sortOrder}, id ${sortOrder} LIMIT ? OFFSET ?`
  ).all(...values, filters.pageSize, offset) as TradeRow[];

  return {
    items: enrichTrades(rows),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems,
      totalPages
    }
  };
}

export function getTradeById(id: number) {
  const row = db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as TradeRow | undefined;
  if (!row) {
    return null;
  }

  return enrichTrades([row])[0] ?? null;
}

export function getAllTrades() {
  const rows = db.prepare('SELECT * FROM trades ORDER BY tradeDate ASC, createdAt ASC, id ASC').all() as TradeRow[];
  return enrichTrades(rows);
}

export function getAllTradeAllocations() {
  const rows = db.prepare('SELECT * FROM trade_lot_allocations ORDER BY id ASC').all() as AllocationRow[];
  return rows.map(mapAllocationRow);
}

export function insertTrade(input: TradeInput) {
  const now = new Date().toISOString();
  const result = db.prepare(
    `INSERT INTO trades (ticker, tradeDate, type, quantity, price, fee, notes, currency, lotSelectionMethod, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.ticker,
    input.tradeDate,
    input.type,
    input.quantity,
    input.price,
    input.fee ?? 0,
    input.notes ?? null,
    input.currency ?? 'USD',
    input.lotSelectionMethod ?? 'FIFO',
    now,
    now
  );

  return Number(result.lastInsertRowid);
}

export function updateTradeRow(id: number, input: TradeInput) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE trades
     SET ticker = ?, tradeDate = ?, type = ?, quantity = ?, price = ?, fee = ?, notes = ?, currency = ?, lotSelectionMethod = ?, updatedAt = ?
     WHERE id = ?`
  ).run(
    input.ticker,
    input.tradeDate,
    input.type,
    input.quantity,
    input.price,
    input.fee ?? 0,
    input.notes ?? null,
    input.currency ?? 'USD',
    input.lotSelectionMethod ?? 'FIFO',
    now,
    id
  );
}

export function deleteTradeRow(id: number) {
  db.prepare('DELETE FROM trades WHERE id = ?').run(id);
}

export function replaceAllAllocations(allocations: PersistedAllocationInput[]) {
  db.prepare('DELETE FROM trade_lot_allocations').run();
  if (allocations.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO trade_lot_allocations (sellTradeId, buyTradeId, quantity, createdAt, buyPriceSnapshot, buyTradeDateSnapshot)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  for (const allocation of allocations) {
    insert.run(
      allocation.sellTradeId,
      allocation.buyTradeId,
      allocation.quantity,
      now,
      allocation.buyPriceSnapshot ?? null,
      allocation.buyTradeDateSnapshot ?? null
    );
  }
}

export function clearAllTrades() {
  db.prepare('DELETE FROM trade_lot_allocations').run();
  db.prepare('DELETE FROM trades').run();
}

export function runInTransaction<T>(fn: () => T) {
  const transaction = db.transaction(fn);
  return transaction();
}
