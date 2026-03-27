# Stock Tracking Journal

A full-stack US stock trading journal for recording BUY/SELL trades, tracking open positions, and analyzing realized/unrealized PnL with allocation-based accounting.

## Features
- Member authentication with JWT + bcrypt
- Account-scoped trades, allocations, positions, dashboard, realized PnL, performance, and yearly/monthly analytics
- Trade CRUD with SQLite persistence
- SELL support for both `FIFO` auto allocation and `SPECIFIC` lot selection
- Allocation-based realized PnL, positions, yearly summaries, and performance metrics
- Available BUY lots lookup for specific-lot selling workflows
- CSV import with preview, validation, and batch import transaction
- CSV export for full trade history and yearly summary
- Replaceable price service backed by Yahoo Finance with cache fallback

## Tech Stack
- Client: React + TypeScript + Vite + Tailwind CSS
- Server: Node.js + Express + TypeScript
- Database: SQLite
- Charts: Recharts
- Dates: dayjs
- HTTP client: axios
- Auth: JWT + bcrypt

## Project Structure
```text
stockTracking/
├── client/
│   └── src/
│       ├── auth/
│       ├── components/
│       ├── lib/
│       └── pages/
├── server/
│   └── src/
│       ├── controllers/
│       ├── db/
│       ├── lib/
│       ├── middleware/
│       ├── routes/
│       ├── scripts/
│       ├── services/
│       └── utils/
├── TEST_REPORT.md
├── package.json
└── README.md
```

## Requirements
- Node.js 20+
- npm 10+

Note:
- `yahoo-finance2` currently recommends Node 22+. The project still builds and tests successfully on Node 20, but the package prints a runtime notice.

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

Seed sample data and a demo member:
```bash
npm run db:seed
```

Seeded demo account:
- email: `demo@example.com`
- password: `DemoPass123!`

SQLite file location:
```text
server/data/stock-tracking.sqlite
```

## Authentication
### Register
API:
- `POST /api/auth/register`

Payload:
```json
{
  "email": "trader@example.com",
  "password": "StrongPass123!",
  "name": "Trader"
}
```

Success response:
```json
{
  "token": "<jwt>",
  "user": {
    "id": 1,
    "email": "trader@example.com",
    "name": "Trader",
    "createdAt": "2026-03-26T00:00:00.000Z",
    "updatedAt": "2026-03-26T00:00:00.000Z"
  }
}
```

### Login
API:
- `POST /api/auth/login`

Payload:
```json
{
  "email": "trader@example.com",
  "password": "StrongPass123!"
}
```

Success response:
- returns the same `{ token, user }` structure as register

### Token usage
Protected requests must include:
```http
Authorization: Bearer <jwt>
```

Example:
```bash
curl -H "Authorization: Bearer <jwt>" http://localhost:4010/api/trades
```

Frontend behavior:
- Login/Register stores the JWT in `localStorage`
- Axios automatically attaches the `Authorization` header
- If the API returns `401` for an expired or invalid token, the client clears auth state and protected routes redirect back to `/login`

## Protected API
The following APIs require a valid JWT:
- `GET /api/trades`
- `POST /api/trades`
- `PUT /api/trades/:id`
- `DELETE /api/trades/:id`
- `POST /api/trades/import`
- `GET /api/trades/export`
- `GET /api/lots/available`
- `GET /api/dashboard`
- `GET /api/positions`
- `GET /api/realized`
- `GET /api/performance`
- `GET /api/yearly-summary`
- `GET /api/yearly-summary/export`
- `GET /api/monthly-summary`

Public APIs:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/health`
- `GET /api/prices/latest`

## Data Isolation Design
- Each trade row now has `userId`
- Every protected trade or analytics query filters by the authenticated `userId`
- `trade_lot_allocations` does not duplicate `userId`; ownership is derived through the SELL trade
- Specific-lot SELL allocations can only reference BUY lots owned by the same user
- FIFO auto-allocation can only consume BUY lots owned by the authenticated user
- Update/Delete trade operations verify ownership before modifying data
- User deletion cascades to that user’s trades, and trade deletion cascades to allocations

Practical result:
- User A cannot see User B trades
- User A cannot update or delete User B trades
- User A cannot allocate a SELL against User B BUY lots
- Positions, realized PnL, performance, and yearly/monthly summaries are always computed from the signed-in user’s trades only

## Frontend Auth UX
- `/login` and `/register` are public routes
- Dashboard, Trades, Positions, Realized PnL, Yearly Performance, and Performance are protected routes
- Unauthenticated access redirects to `/login`
- The app shell shows the signed-in member and provides logout

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

Run browser E2E smoke tests:
```bash
npx playwright install chromium
npm run test:e2e
```

Latest QA report:
```text
TEST_REPORT.md
```

Covered auth tests:
- register / login success
- protected API without token returns `401`
- user B cannot read or modify user A trade data
- SELL allocation cannot use another user’s BUY lot

## FIFO And Specific Lot Rules
- `FIFO` is an auto-allocation strategy only
- All realized PnL calculations come from persisted `trade_lot_allocations`
- All open positions come from BUY lots minus allocated quantities
- A SELL cannot exceed available shares
- For `SPECIFIC`, allocation quantity sum must equal SELL quantity
- For `SPECIFIC`, each allocation must reference a BUY trade of the same ticker, and the BUY trade date cannot be later than the SELL trade date

## SELL Allocation Model
- `BUY` trades create lots
- `SELL + FIFO` writes allocations automatically on the backend
- `SELL + SPECIFIC` accepts explicit allocations and persists them after validation
- Realized PnL uses sell proceeds minus allocated cost basis minus sell fee
- Unrealized PnL uses remaining open lots plus the latest price service

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
- It is optional
- It lets a SELL row reference a BUY row imported earlier in the same file
- Referenced BUY rows must appear earlier than the SELL row in the CSV batch

Import behavior:
- `FIFO` SELL rows do not need `allocations`
- `SPECIFIC` SELL rows must include valid allocation JSON
- The backend still enforces position limits and allocation validation during import

## CSV Export
Trade history export:
- Endpoint: `GET /api/trades/export`
- Includes `lotSelectionMethod`
- Includes `allocations` summary JSON for SELL rows

Yearly summary export:
- Endpoint: `GET /api/yearly-summary/export`
- Includes realized/unrealized PnL, trade count, gross buy/sell amount, and return rate

## Price Service
Current file:
- `server/src/services/priceService.ts`

Current behavior:
- Uses `yahoo-finance2` for latest quote data
- Applies a short cache TTL to avoid hammering the upstream service
- Falls back to cached values when live fetch fails
- Returns `null` price data when no live or cached price is available, so analytics endpoints stay alive

Current price endpoint:
- `GET /api/prices/latest?ticker=AAPL`

## Backend API Overview
Health:
- `GET /api/health`

Auth:
- `POST /api/auth/register`
- `POST /api/auth/login`

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

## Error Handling
Server responses cover:
- `401` missing bearer token
- `401` invalid token
- `401` expired token
- `403` forbidden cross-user trade access or lot allocation
- `409` duplicate email on registration
- `401` invalid email/password on login

## Flow Summary
1. User registration flow
- Client sends `email`, `password`, and optional `name` to `POST /api/auth/register`
- Server validates input, hashes password with bcrypt, creates the user, signs a JWT, and returns `{ token, user }`
- Client stores the token and user, then enters the protected app

2. Login flow
- Client sends `email` and `password` to `POST /api/auth/login`
- Server verifies the bcrypt password hash and signs a JWT with `userId` + `email`
- Client stores the token, attaches it to future API calls, and opens the member workspace

3. How token verification works
- Frontend sends `Authorization: Bearer <jwt>`
- `authenticateJWT` verifies the token signature and expiry
- The middleware attaches `req.user = { userId, email }`
- Protected route handlers use `req.user.userId` as the only identity source

4. How APIs restrict data
- Trade queries filter by `WHERE userId = ?`
- Ownership checks run before update/delete
- Available-lots and FIFO/SPECIFIC allocation logic only consider BUY lots from the same user
- Dashboard, positions, realized, performance, yearly summary, and monthly summary are all built from user-scoped trades only

## Notes
- The frontend trade import/export controls live on the `Trades` page
- The `Realized PnL` page can expand each SELL to inspect allocation details
- Analytics are allocation-based throughout the backend
