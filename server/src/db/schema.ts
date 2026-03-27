export const userTableSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    name TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`;

export const tradeTableSchema = `
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    tradeDate TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('BUY', 'SELL')),
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    fee REAL NOT NULL DEFAULT 0,
    notes TEXT,
    currency TEXT NOT NULL DEFAULT 'USD',
    lotSelectionMethod TEXT NOT NULL DEFAULT 'FIFO' CHECK(lotSelectionMethod IN ('FIFO', 'SPECIFIC')),
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trade_lot_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sellTradeId INTEGER NOT NULL,
    buyTradeId INTEGER NOT NULL,
    quantity REAL NOT NULL,
    createdAt TEXT NOT NULL,
    buyPriceSnapshot REAL,
    buyTradeDateSnapshot TEXT,
    FOREIGN KEY (sellTradeId) REFERENCES trades(id) ON DELETE CASCADE,
    FOREIGN KEY (buyTradeId) REFERENCES trades(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades(ticker);
  CREATE INDEX IF NOT EXISTS idx_trades_trade_date ON trades(tradeDate);
  CREATE INDEX IF NOT EXISTS idx_trades_type ON trades(type);
  CREATE INDEX IF NOT EXISTS idx_allocations_sell_trade_id ON trade_lot_allocations(sellTradeId);
  CREATE INDEX IF NOT EXISTS idx_allocations_buy_trade_id ON trade_lot_allocations(buyTradeId);
`;
