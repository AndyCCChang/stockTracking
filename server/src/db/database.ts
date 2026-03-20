import Database from 'better-sqlite3';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), 'data.sqlite');
export const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    tradeDate TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('BUY', 'SELL')),
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    fees REAL NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`);
