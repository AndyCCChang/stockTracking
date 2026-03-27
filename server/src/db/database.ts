import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tradeTableSchema, userTableSchema } from './schema.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(currentDir, '../..');
const dataDir = path.join(serverRoot, 'data');
const databaseFile = path.join(dataDir, 'stock-tracking.sqlite');
const LEGACY_USER_EMAIL = 'legacy@stock-tracking.local';
const LEGACY_PASSWORD_HASH = 'legacy-user-disabled';

mkdirSync(dataDir, { recursive: true });

export const db = new Database(databaseFile);

type MigrationTradeRow = {
  id: number;
  ticker: string;
  tradeDate: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  fee: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  lotSelectionMethod?: 'FIFO' | 'SPECIFIC';
};

type OpenBuyLot = {
  id: number;
  ticker: string;
  tradeDate: string;
  quantity: number;
  allocatedQuantity: number;
  price: number;
};

function hasTradeColumn(columnName: string) {
  const columns = db.prepare('PRAGMA table_info(trades)').all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

function ensureTradeColumn(columnName: string, statement: string) {
  if (!hasTradeColumn(columnName)) {
    db.exec(statement);
  }
}

function ensureLegacyUser() {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(LEGACY_USER_EMAIL) as { id: number } | undefined;
  if (existing) {
    return Number(existing.id);
  }

  const now = new Date().toISOString();
  const result = db.prepare(
    `INSERT INTO users (email, passwordHash, name, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?)`
  ).run(LEGACY_USER_EMAIL, LEGACY_PASSWORD_HASH, 'Legacy Seed User', now, now);

  return Number(result.lastInsertRowid);
}

function ensureTradeUserIdColumn() {
  if (!hasTradeColumn('userId')) {
    db.exec('ALTER TABLE trades ADD COLUMN userId INTEGER');
  }

  const legacyUserId = ensureLegacyUser();
  db.prepare('UPDATE trades SET userId = ? WHERE userId IS NULL').run(legacyUserId);
  db.exec('CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(userId)');
}

function backfillLegacyAllocations() {
  const allocationCountRow = db.prepare('SELECT COUNT(*) as count FROM trade_lot_allocations').get() as { count: number };
  const sellCountRow = db.prepare("SELECT COUNT(*) as count FROM trades WHERE type = 'SELL'").get() as { count: number };
  if (Number(allocationCountRow.count) > 0 || Number(sellCountRow.count) === 0) {
    return;
  }

  const trades = db.prepare('SELECT * FROM trades ORDER BY tradeDate ASC, createdAt ASC, id ASC').all() as MigrationTradeRow[];
  const buyLots = new Map<string, OpenBuyLot[]>();
  const insertAllocation = db.prepare(
    `INSERT INTO trade_lot_allocations (sellTradeId, buyTradeId, quantity, createdAt, buyPriceSnapshot, buyTradeDateSnapshot)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  for (const trade of trades) {
    const tickerLots = buyLots.get(trade.ticker) ?? [];
    if (trade.type === 'BUY') {
      tickerLots.push({
        id: trade.id,
        ticker: trade.ticker,
        tradeDate: trade.tradeDate,
        quantity: Number(trade.quantity),
        allocatedQuantity: 0,
        price: Number(trade.price)
      });
      buyLots.set(trade.ticker, tickerLots);
      continue;
    }

    let remaining = Number(trade.quantity);
    for (const lot of tickerLots) {
      if (remaining <= 0) {
        break;
      }

      const available = lot.quantity - lot.allocatedQuantity;
      if (available <= 0) {
        continue;
      }

      const allocated = Math.min(available, remaining);
      lot.allocatedQuantity += allocated;
      remaining -= allocated;
      insertAllocation.run(trade.id, lot.id, allocated, new Date().toISOString(), lot.price, lot.tradeDate);
    }
  }
}

export function initializeDatabase() {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  db.exec(userTableSchema);
  db.exec(tradeTableSchema);
  ensureTradeColumn(
    'lotSelectionMethod',
    "ALTER TABLE trades ADD COLUMN lotSelectionMethod TEXT NOT NULL DEFAULT 'FIFO'"
  );
  ensureTradeUserIdColumn();
  db.prepare(
    `INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run('initializedAt', new Date().toISOString());
  backfillLegacyAllocations();
}

initializeDatabase();

export function getDatabaseStatus() {
  db.prepare('SELECT 1').get();
  return {
    file: databaseFile,
    exists: existsSync(databaseFile),
    driver: 'better-sqlite3',
    status: 'connected' as const
  };
}
