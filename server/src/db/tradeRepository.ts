import type { Queryable } from './database.js';
import { query, withTransaction } from './database.js';
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
  tradeDate: '"tradeDate"',
  type: 'type',
  quantity: 'quantity',
  price: 'price',
  fee: 'fee',
  createdAt: '"createdAt"',
  updatedAt: '"updatedAt"'
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

async function getAllocationsBySellIds(userId: number, sellTradeIds: number[], db?: Queryable) {
  if (sellTradeIds.length === 0) {
    return new Map<number, TradeLotAllocationRecord[]>();
  }

  const result = await query<AllocationRow>(
    `SELECT a.*
     FROM trade_lot_allocations a
     JOIN trades sell_trade ON sell_trade.id = a."sellTradeId"
     WHERE sell_trade."userId" = $1 AND a."sellTradeId" = ANY($2::int[])
     ORDER BY a.id ASC`,
    [userId, sellTradeIds],
    db
  );

  const allocationMap = new Map<number, TradeLotAllocationRecord[]>();
  for (const row of result.rows.map(mapAllocationRow)) {
    const current = allocationMap.get(row.sellTradeId) ?? [];
    current.push(row);
    allocationMap.set(row.sellTradeId, current);
  }

  return allocationMap;
}

async function enrichTrades(userId: number, rows: TradeRow[], db?: Queryable) {
  const trades = rows.map(mapTradeRow);
  const allocationMap = await getAllocationsBySellIds(userId, trades.map((trade) => trade.id), db);
  return trades.map((trade) => ({
    ...trade,
    allocations: allocationMap.get(trade.id) ?? []
  }));
}

export async function listTrades(userId: number, filters: TradeFilters, db?: Queryable): Promise<TradeListResult> {
  const conditions: string[] = ['"userId" = $1'];
  const values: Array<string | number> = [userId];

  if (filters.ticker) {
    values.push(filters.ticker);
    conditions.push(`ticker = $${values.length}`);
  }

  if (filters.type) {
    values.push(filters.type);
    conditions.push(`type = $${values.length}`);
  }

  if (filters.startDate) {
    values.push(filters.startDate);
    conditions.push(`"tradeDate" >= $${values.length}`);
  }

  if (filters.endDate) {
    values.push(filters.endDate);
    conditions.push(`"tradeDate" <= $${values.length}`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const totalResult = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM trades ${whereClause}`, values, db);
  const totalItems = Number(totalResult.rows[0]?.count ?? 0);
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / filters.pageSize);
  const offset = (filters.page - 1) * filters.pageSize;
  const sortColumn = sortColumnMap[filters.sortBy];
  const sortOrder = filters.sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const pagedValues = [...values, filters.pageSize, offset];

  const rowsResult = await query<TradeRow>(
    `SELECT * FROM trades ${whereClause}
     ORDER BY ${sortColumn} ${sortOrder}, id ${sortOrder}
     LIMIT $${pagedValues.length - 1} OFFSET $${pagedValues.length}`,
    pagedValues,
    db
  );

  return {
    items: await enrichTrades(userId, rowsResult.rows, db),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems,
      totalPages
    }
  };
}

export async function getTradeById(userId: number, id: number, db?: Queryable) {
  const result = await query<TradeRow>('SELECT * FROM trades WHERE id = $1 AND "userId" = $2 LIMIT 1', [id, userId], db);
  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return (await enrichTrades(userId, [row], db))[0] ?? null;
}

export async function getTradeOwnerId(id: number, db?: Queryable) {
  const result = await query<{ userId: number }>('SELECT "userId" FROM trades WHERE id = $1 LIMIT 1', [id], db);
  return result.rows[0] ? Number(result.rows[0].userId) : null;
}

export async function getAllTrades(userId: number, db?: Queryable) {
  const result = await query<TradeRow>(
    'SELECT * FROM trades WHERE "userId" = $1 ORDER BY "tradeDate" ASC, "createdAt" ASC, id ASC',
    [userId],
    db
  );
  return enrichTrades(userId, result.rows, db);
}

export async function getAllTradeAllocations(userId: number, db?: Queryable) {
  const result = await query<AllocationRow>(
    `SELECT a.*
     FROM trade_lot_allocations a
     JOIN trades sell_trade ON sell_trade.id = a."sellTradeId"
     WHERE sell_trade."userId" = $1
     ORDER BY a.id ASC`,
    [userId],
    db
  );
  return result.rows.map(mapAllocationRow);
}

export async function insertTrade(userId: number, input: TradeInput, db?: Queryable) {
  const now = new Date().toISOString();
  const result = await query<{ id: number }>(
    `INSERT INTO trades ("userId", ticker, "tradeDate", type, quantity, price, fee, notes, currency, "lotSelectionMethod", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
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
    ],
    db
  );

  return Number(result.rows[0].id);
}

export async function updateTradeRow(id: number, input: TradeInput, db?: Queryable) {
  const now = new Date().toISOString();
  await query(
    `UPDATE trades
     SET ticker = $1, "tradeDate" = $2, type = $3, quantity = $4, price = $5, fee = $6, notes = $7, currency = $8, "lotSelectionMethod" = $9, "updatedAt" = $10
     WHERE id = $11`,
    [
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
    ],
    db
  );
}

export async function deleteTradeRow(id: number, db?: Queryable) {
  await query('DELETE FROM trades WHERE id = $1', [id], db);
}

export async function replaceAllAllocations(userId: number, allocations: PersistedAllocationInput[], db?: Queryable) {
  await query(
    `DELETE FROM trade_lot_allocations
     WHERE "sellTradeId" IN (SELECT id FROM trades WHERE "userId" = $1)`,
    [userId],
    db
  );

  if (allocations.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  for (const allocation of allocations) {
    await query(
      `INSERT INTO trade_lot_allocations ("sellTradeId", "buyTradeId", quantity, "createdAt", "buyPriceSnapshot", "buyTradeDateSnapshot")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        allocation.sellTradeId,
        allocation.buyTradeId,
        allocation.quantity,
        now,
        allocation.buyPriceSnapshot ?? null,
        allocation.buyTradeDateSnapshot ?? null
      ],
      db
    );
  }
}

export async function clearAllData(db?: Queryable) {
  await query('TRUNCATE TABLE trade_lot_allocations, trades, users RESTART IDENTITY CASCADE', [], db);
}

export async function runInTransaction<T>(fn: (db: Queryable) => Promise<T>) {
  return withTransaction(async (client) => fn(client));
}
