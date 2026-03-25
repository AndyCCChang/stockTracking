# Stock Tracking Journal

A full-stack US stock trading journal for recording BUY/SELL trades, tracking open positions, and analyzing realized/unrealized PnL with allocation-based accounting.

## Features
- Trade CRUD with SQLite persistence
- SELL support for both `FIFO` auto allocation and `SPECIFIC` lot selection
- Allocation-based realized PnL, positions, yearly summaries, and performance metrics
- Available BUY lots lookup for specific-lot selling workflows
- CSV import with preview, validation, and batch import transaction
- CSV export for full trade history and yearly summary
- Replaceable price service with a mock provider ready to swap for Yahoo Finance, Finnhub, or Alpha Vantage

## Tech Stack
- Client: React + TypeScript + Vite + Tailwind CSS
- Server: Node.js + Express + TypeScript
- Database: SQLite
- Charts: Recharts
- Dates: dayjs
- HTTP client: axios

## Project Structure
```text
stockTracking/
├── client/
│   └── src/
│       ├── components/
│       ├── lib/
│       └── pages/
├── server/
│   └── src/
│       ├── db/
│       ├── lib/
│       ├── routes/
│       ├── scripts/
│       └── services/
├── shared/
├── package.json
└── README.md
```

## Requirements
- Node.js 20+
- npm 10+

## Install
```bash
npm install
```

## Run
Start both apps:
```bash
npm run dev
```

Start only the client:
```bash
npm run dev:client
```

Start only the server:
```bash
npm run dev:server
```

## Database Setup
Initialize the SQLite schema:
```bash
npm run db:init
```

Seed sample trades:
```bash
npm run db:seed
```

SQLite file location:
```text
server/data/stock-tracking.sqlite
```

## Tests
Run the server tests:
```bash
npm run test:server
```

Run full validation:
```bash
npm --prefix server run lint
npm --prefix client run lint
npm run build
```

Latest QA report:
```text
TEST_REPORT.md
```

## FIFO And Specific Lot Rules
- `FIFO` is an auto-allocation strategy only.
- All realized PnL calculations come from persisted `trade_lot_allocations`.
- All open positions come from BUY lots minus allocated quantities.
- A SELL cannot exceed available shares.
- For `SPECIFIC`, allocation quantity sum must equal SELL quantity.
- For `SPECIFIC`, each allocation must reference a BUY trade of the same ticker, and the BUY trade date cannot be later than the SELL trade date.

## SELL Allocation Model
- `BUY` trades create lots.
- `SELL + FIFO` writes allocations automatically on the backend.
- `SELL + SPECIFIC` accepts explicit allocations and persists them after validation.
- Realized PnL uses sell proceeds minus allocated cost basis minus sell fee.
- Unrealized PnL uses remaining open lots plus the latest price service.

## CSV Import
The frontend import flow supports:
- Upload CSV file
- Preview rows before import
- Row-level parse errors before submission
- Backend batch validation inside a single transaction

### Supported Columns
Required columns:
- `ticker`
- `tradeDate`
- `type`
- `quantity`
- `price`

Optional columns:
- `fee`
- `notes`
- `currency`
- `lotSelectionMethod`
- `allocations`
- `importRef`

### Specific Lot CSV Format
For `SELL` rows with `lotSelectionMethod=SPECIFIC`, use `allocations` as a JSON array string.

Example using an existing BUY trade id:
```csv
ticker,tradeDate,type,quantity,price,fee,currency,lotSelectionMethod,allocations
AAPL,2026-03-20,SELL,5,210,1,USD,SPECIFIC,"[{""buyTradeId"":12,""quantity"":5}]"
```

Example using an import reference inside the same CSV batch:
```csv
importRef,ticker,tradeDate,type,quantity,price,fee,currency,lotSelectionMethod,allocations
AAPL-LOT-1,AAPL,2026-01-03,BUY,10,180,1,USD,FIFO,
,AAPL,2026-03-20,SELL,5,210,1,USD,SPECIFIC,"[{""buyTradeRef"":""AAPL-LOT-1"",""quantity"":5}]"
```

Rules for `buyTradeRef`:
- It is optional.
- It lets a SELL row reference a BUY row imported earlier in the same file.
- Referenced BUY rows must appear earlier than the SELL row in the CSV batch.

Import behavior:
- `FIFO` SELL rows do not need `allocations`.
- `SPECIFIC` SELL rows must include valid allocation JSON.
- The backend still enforces position limits and allocation validation during import.

## CSV Export
Trade history export:
- Endpoint: `GET /api/trades/export`
- Includes `lotSelectionMethod`
- Includes `allocations` summary JSON for SELL rows

Yearly summary export:
- Endpoint: `GET /api/yearly-summary/export`
- Includes realized/unrealized PnL, trade count, gross buy/sell amount, and return rate

## Replaceable Price Service
Current file:
- `server/src/services/priceService.ts`

Current behavior:
- The service supports `mock`, `finnhub`, and `alphavantage` providers.
- If no API key is configured, it safely falls back to the in-memory mock price map.

Environment configuration:
```bash
PRICE_PROVIDER=auto
FINNHUB_API_KEY=your_key_here
ALPHA_VANTAGE_API_KEY=your_key_here
```

Provider selection rules:
1. `PRICE_PROVIDER=auto` prefers Finnhub when `FINNHUB_API_KEY` is set.
2. Otherwise `auto` falls back to Alpha Vantage when `ALPHA_VANTAGE_API_KEY` is set.
3. If neither key is present, the app uses the mock provider so local development still works.

Current price endpoint:
- `GET /api/prices/latest?ticker=AAPL`

Example env file:
- `.env.example`

## Backend API Overview
Health:
- `GET /api/health`

Trades:
- `GET /api/trades`
- `POST /api/trades`
- `PUT /api/trades/:id`
- `DELETE /api/trades/:id`
- `POST /api/trades/import`
- `GET /api/trades/export`

Lot lookup:
- `GET /api/lots/available?ticker=AAPL&tradeDate=2026-03-20`

Analytics:
- `GET /api/dashboard`
- `GET /api/positions`
- `GET /api/realized`
- `GET /api/performance`
- `GET /api/yearly-summary`
- `GET /api/yearly-summary/export`
- `GET /api/monthly-summary?year=2026`

Prices:
- `GET /api/prices/latest?ticker=AAPL`

## Notes
- The frontend trade import/export controls live on the `Trades` page.
- The `Realized PnL` page can expand each SELL to inspect its allocation details.
- Analytics are allocation-based throughout the backend.
