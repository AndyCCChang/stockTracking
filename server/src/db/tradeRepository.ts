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

type TradeRow = Omit<TradeRecord, 'allocations'> & { userId: number };
type AllocationRow = TradeLotAllocationRecord;

type PersistedAllocationInput = TradeLotAllocationInput & {
  sellTradeId: number;
  buyPriceSnapshot?: number | null;
  buyTradeDateSnapshot?: string | null;
};

function mapTradeRow(row: TradeRow): TradeRecord {
  return {
    id: Number(row.id),
    ticker: row.ticker,
    tradeDate: row.tradeDate,
    type: row.type,
    quantity: Number(row.quantity),
    price: Number(row.price),
    fee: Number(row.fee),
    notes: row.notes ?? null,
    currency: row.currency,
    lotSelectionMethod: row.lotSelectionMethod as LotSelectionMethod,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    allocations: []
  };
}

function mapAllocationRow(row: AllocationRow): TradeLotAllocationRecord {
  return {
    id: Number(row.id),
    sellTradeId: Number(row.sellTradeId),
    buyTradeId: Number(row.buyTradeId),
    quantity: Number(row.quantity),
    createdAt: row.createdAt,
    buyPriceSnapshot: row.buyPriceSnapshot == null ? null : Number(row.buyPriceSnapshot),
    buyTradeDateSnapshot: row.buyTradeDateSnapshot ?? null
  };
}

function getAllocationsBySellIds(userId: number, sellTradeIds: number[]) {
  if (sellTradeIds.length === 0) {
    return new Map<number, TradeLotAllocationRecord[]>();
  }

  const placeholders = sellTradeIds.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT a.*
     FROM trade_lot_allocations a
     JOIN trades sellTrade ON sellTrade.id = a.sellTradeId
     WHERE sellTrade.userId = ? AND a.sellTradeId IN (${placeholders})
     ORDER BY a.id ASC`
  ).all(userId, ...sellTradeIds) as AllocationRow[];

  const allocationMap = new Map<number, TradeLotAllocationRecord[]>();
  for (const row of rows.map(mapAllocationRow)) {
    const current = allocationMap.get(row.sellTradeId) ?? [];
    current.push(row);
    allocationMap.set(row.sellTradeId, current);
  }

  return allocationMap;
}

function enrichTrades(userId: number, rows: TradeRow[]) {
  const trades = rows.map(mapTradeRow);
  const allocationMap = getAllocationsBySellIds(userId, trades.map((trade) => trade.id));
  return trades.map((trade) => ({
    ...trade,
    allocations: allocationMap.get(trade.id) ?? []
  }));
}

export function listTrades(userId: number, filters: TradeFilters): TradeListResult {
  const conditions: string[] = ['userId = ?'];
  const values: Array<string | number> = [userId];

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

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
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
    items: enrichTrades(userId, rows),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems,
      totalPages
    }
  };
}

export function getTradeById(userId: number, id: number) {
  const row = db.prepare('SELECT * FROM trades WHERE id = ? AND userId = ?').get(id, userId) as TradeRow | undefined;
  if (!row) {
    return null;
  }

  return enrichTrades(userId, [row])[0] ?? null;
}

export function getTradeOwnerId(id: number) {
  const row = db.prepare('SELECT userId FROM trades WHERE id = ?').get(id) as { userId: number } | undefined;
  return row ? Number(row.userId) : null;
}

export function getAllTrades(userId: number) {
  const rows = db.prepare(
    'SELECT * FROM trades WHERE userId = ? ORDER BY tradeDate ASC, createdAt ASC, id ASC'
  ).all(userId) as TradeRow[];
  return enrichTrades(userId, rows);
}

export function getAllTradeAllocations(userId: number) {
  const rows = db.prepare(
    `SELECT a.*
     FROM trade_lot_allocations a
     JOIN trades sellTrade ON sellTrade.id = a.sellTradeId
     WHERE sellTrade.userId = ?
     ORDER BY a.id ASC`
  ).all(userId) as AllocationRow[];
  return rows.map(mapAllocationRow);
}

export function insertTrade(userId: number, input: TradeInput) {
  const now = new Date().toISOString();
  const result = db.prepare(
    `INSERT INTO trades (userId, ticker, tradeDate, type, quantity, price, fee, notes, currency, lotSelectionMethod, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
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

export function replaceAllAllocations(userId: number, allocations: PersistedAllocationInput[]) {
  db.prepare(
    `DELETE FROM trade_lot_allocations
     WHERE sellTradeId IN (SELECT id FROM trades WHERE userId = ?)`
  ).run(userId);

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

export function clearAllData() {
  db.prepare('DELETE FROM trade_lot_allocations').run();
  db.prepare('DELETE FROM trades').run();
  db.prepare('DELETE FROM users').run();
}

export function runInTransaction<T>(fn: () => T) {
  const transaction = db.transaction(fn);
  return transaction();
}
