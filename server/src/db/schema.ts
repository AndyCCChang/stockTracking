export const appMetaSchema = `
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

export const userTableSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    name TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`;

export const tradeTableSchema = `
  CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker TEXT NOT NULL,
    "tradeDate" TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('BUY', 'SELL')),
    quantity DOUBLE PRECISION NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    fee DOUBLE PRECISION NOT NULL DEFAULT 0,
    notes TEXT,
    currency TEXT NOT NULL DEFAULT 'USD',
    "lotSelectionMethod" TEXT NOT NULL DEFAULT 'FIFO' CHECK("lotSelectionMethod" IN ('FIFO', 'SPECIFIC')),
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trade_lot_allocations (
    id SERIAL PRIMARY KEY,
    "sellTradeId" INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    "buyTradeId" INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    quantity DOUBLE PRECISION NOT NULL,
    "createdAt" TEXT NOT NULL,
    "buyPriceSnapshot" DOUBLE PRECISION,
    "buyTradeDateSnapshot" TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades("userId");
  CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades(ticker);
  CREATE INDEX IF NOT EXISTS idx_trades_trade_date ON trades("tradeDate");
  CREATE INDEX IF NOT EXISTS idx_trades_type ON trades(type);
  CREATE INDEX IF NOT EXISTS idx_allocations_sell_trade_id ON trade_lot_allocations("sellTradeId");
  CREATE INDEX IF NOT EXISTS idx_allocations_buy_trade_id ON trade_lot_allocations("buyTradeId");
`;
