# Stock Tracking Journal

A full-stack US stock trading journal for recording BUY/SELL trades, managing lot allocations, and analyzing open positions, realized PnL, unrealized PnL, and yearly/monthly performance.

## Features
- JWT authentication with bcrypt password hashing
- Account-scoped trades, analytics, and allocations
- SELL support for both `FIFO` auto allocation and `SPECIFIC` lot selection
- Allocation-based realized PnL, positions, performance, and yearly/monthly summaries
- CSV import/export and in-app JSON import editor
- Replaceable live price service backed by Yahoo Finance with cache fallback

## Tech Stack
- Client: React + TypeScript + Vite + Tailwind CSS
- Server: Node.js + Express + TypeScript
- Database: PostgreSQL
- Charts: Recharts
- Dates: dayjs
- HTTP client: axios
- Auth: JWT + bcrypt

## Project Structure
```text
stockTracking/
├── client/
│   ├── src/
│   └── vercel.json
├── server/
│   └── src/
├── render.yaml
├── .env.example
├── TEST_REPORT.md
├── package.json
└── README.md
```

## Requirements
- Node.js 20+
- npm 10+
- PostgreSQL 14+

Note:
- `yahoo-finance2` currently recommends Node 22+. The project still builds successfully on Node 20, but the package may print a runtime notice.

## Install
```bash
npm install
```

## Environment Variables
Copy `.env.example` and fill in the values you need.

### Server
- `NODE_ENV`
  Optional. Use `production` on Render. In production, the server now fails fast if `DATABASE_URL` or `JWT_SECRET` is missing.
- `DATABASE_URL`
  PostgreSQL connection string. Example:
  `postgresql://postgres:postgres@127.0.0.1:5432/stock_tracking`
- `JWT_SECRET`
  Long random secret used to sign JWTs.
- `PORT`
  API port. Default: `4000` locally, `10000` on Render is recommended.
- `CORS_ORIGIN`
  Allowed frontend origins, comma-separated. Example:
  `http://localhost:5173,https://your-app.vercel.app`
- `PRICE_PROVIDER`
  `auto`, `finnhub`, `alphavantage`, or `mock`
- `FINNHUB_API_KEY`
  Optional
- `ALPHA_VANTAGE_API_KEY`
  Optional

### Client
- `VITE_API_URL`
  Full API base URL including `/api`.
  Example local value:
  `http://localhost:4000/api`
  Example production value:
  `https://your-render-service.onrender.com/api`

## Local Development
Start both apps:
```bash
npm run dev
```

Development note:
- If `DATABASE_URL` is not set locally, the server now falls back to an in-memory Postgres-compatible database for development only.
- This removes the immediate GUI error when PostgreSQL is not installed, but the data is not persisted between server restarts.
- In memory mode, the app auto-seeds the demo account `demo@example.com` / `DemoPass123!`.
- To keep real persistent local data, set `DATABASE_URL` to a running PostgreSQL instance.

Start only the client:
```bash
npm run dev:client
```

Start only the server:
```bash
npm run dev:server
```

## Database Setup
Initialize PostgreSQL tables:
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

## End-to-End Tests
Playwright E2E tests require a reachable PostgreSQL database because the suite seeds the backend before starting the app.

Example:
```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/stock_tracking npm run test:e2e
```

If `DATABASE_URL` is missing, the test command now fails fast with a clear message instead of waiting for the server to crash during startup.

## Authentication
### Register
- `POST /api/auth/register`

Payload:
```json
{
  "email": "trader@example.com",
  "password": "StrongPass123!",
  "name": "Trader"
}
```

### Login
- `POST /api/auth/login`

Payload:
```json
{
  "email": "trader@example.com",
  "password": "StrongPass123!"
}
```

### Token usage
Protected requests must include:
```http
Authorization: Bearer <jwt>
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

## Health Endpoint
- `GET /api/health`

The health payload now includes:
- overall status and timestamp
- runtime metadata: `nodeEnv`, `nodeVersion`, `port`
- service metadata: database driver/name, whether CORS is configured, and the active price provider

This is useful after deployment to confirm that Render picked up the expected environment values.

## Data Isolation Design
- Each trade row has `userId`
- Every protected trade or analytics query filters by the authenticated `userId`
- `trade_lot_allocations` does not duplicate `userId`; ownership is derived through the SELL trade
- Specific-lot SELL allocations can only reference BUY lots owned by the same user
- FIFO auto-allocation can only consume BUY lots owned by the authenticated user
- Update/Delete trade operations verify ownership before modifying data
- User deletion cascades to that user’s trades, and trade deletion cascades to allocations

## Deployment Overview
Recommended production layout:
- Frontend: Vercel
- Backend: Render Web Service
- Database: PostgreSQL

The frontend reads `VITE_API_URL` and sends requests directly to the Render API.
The backend reads `DATABASE_URL`, `JWT_SECRET`, `PORT`, and optional `CORS_ORIGIN`.

## Deploy Frontend To Vercel
1. Push this repo to GitHub.
2. In Vercel, create a new project.
3. Set the project Root Directory to `client`.
4. Build command:
```bash
npm run build
```
5. Output directory:
```bash
dist
```
6. Add environment variable:
```bash
VITE_API_URL=https://your-render-service.onrender.com/api
```
7. Deploy.

Notes:
- `client/vercel.json` includes an SPA rewrite so React Router routes resolve to `index.html`.
- After deployment, copy your Vercel domain and add it to the backend `CORS_ORIGIN`.

## Deploy Backend To Render
1. Create a PostgreSQL database.
2. Create a new Render Web Service from this repo.
3. Use the settings from `render.yaml`, or configure manually:
   - Build command:
   ```bash
   npm install && npm --prefix server run build
   ```
   - Start command:
   ```bash
   npm --prefix server run start
   ```
4. Add environment variables:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `PORT`
   - `CORS_ORIGIN`
   - optional price provider variables
5. Deploy.
6. Run database initialization once:
```bash
npm --prefix server run db:init
```
7. If you want demo data, run:
```bash
npm --prefix server run db:seed
```

Recommended production values:
```bash
NODE_ENV=production
PORT=10000
CORS_ORIGIN=https://your-app.vercel.app
```

## Continuous Integration
GitHub Actions now runs two CI jobs on every push and pull request:
- `validate`: starts PostgreSQL, initializes and seeds the database, then runs server lint, client lint, server tests, and production build
- `e2e`: starts PostgreSQL again, installs Playwright Chromium, runs the browser test suite against the full app, and uploads the Playwright HTML report plus trace artifacts

The workflow file is [`.github/workflows/ci.yml`](/home/test2/github_proj/stockTracking/.github/workflows/ci.yml).

## PostgreSQL Notes
- The app auto-creates its tables on first boot.
- `DATABASE_URL` should point to your managed PostgreSQL instance.
- For small production setups, Render PostgreSQL is a reasonable default.

## Deployment Checklist
Use this sequence to avoid broken URLs or CORS issues:

1. Push the repo to GitHub.
2. Create a Render PostgreSQL database and copy its internal `DATABASE_URL`.
3. Create the Render Web Service for the backend.
4. Set backend env vars on Render:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `PORT=10000`
   - `CORS_ORIGIN`
   - optional price provider keys
5. Deploy the backend first and confirm `GET /api/health` works.
6. Create the Vercel project for `client`.
7. Set `VITE_API_URL=https://your-render-service.onrender.com/api` on Vercel.
8. Deploy the frontend.
9. Copy the real Vercel domain and update backend `CORS_ORIGIN` if needed.
10. Run `npm --prefix server run db:seed` if you want a demo account on production or staging.
11. Verify login, trades, positions, and dashboard in the deployed app.

## Render PostgreSQL Setup
1. In Render, create a new PostgreSQL service.
2. Choose your region and plan.
3. After creation, copy:
   - `Internal Database URL` for the backend service
   - `External Database URL` only if you need to connect from your local machine
4. Use the internal URL for Render backend env `DATABASE_URL`.
5. The backend will auto-create tables on first boot, but you should still run:
```bash
npm --prefix server run db:init
```
6. If you want starter data, run:
```bash
npm --prefix server run db:seed
```

## Render Web Service Fields
Manual settings if you do not use `render.yaml`:
- Root Directory: repo root
- Runtime: Node
- Build Command: `npm install && npm --prefix server run build`
- Start Command: `npm --prefix server run start`
- Health Check Path: `/api/health`

Required env vars:
```bash
DATABASE_URL=<render-internal-postgres-url>
JWT_SECRET=<long-random-secret>
PORT=10000
CORS_ORIGIN=https://your-app.vercel.app
PRICE_PROVIDER=auto
```

## Vercel Project Fields
Recommended Vercel settings:
- Framework Preset: `Vite`
- Root Directory: `client`
- Build Command: `npm run build`
- Output Directory: `dist`

Required env var:
```bash
VITE_API_URL=https://your-render-service.onrender.com/api
```

## Production Env Examples
Backend example:
```bash
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=replace-with-a-long-random-secret
PORT=10000
CORS_ORIGIN=https://your-app.vercel.app
PRICE_PROVIDER=auto
FINNHUB_API_KEY=
ALPHA_VANTAGE_API_KEY=
```

Frontend example:
```bash
VITE_API_URL=https://your-render-service.onrender.com/api
```

## Post-Deploy Verification
After both services are live, verify these in order:

1. Open `https://your-render-service.onrender.com/api/health` and confirm it returns `status: ok`.
2. Open the Vercel frontend and confirm the login page loads without CORS errors.
3. Register or log in with a known account.
4. Load `Dashboard`, `Trades`, and `Positions`.
5. Create one BUY trade and confirm it appears immediately.
6. If using demo data, confirm positions and analytics are populated.
7. Check browser devtools once for failed requests or mixed-origin errors.


## Build And Validation
Run full validation:
```bash
npm --prefix server run lint
npm --prefix client run lint
npm run build
```

Run server tests:
```bash
npm run test:server
```

Note:
- Integration tests are skipped unless `DATABASE_URL` is set for the test environment.

Run browser E2E smoke tests:
```bash
npx playwright install chromium
npm run test:e2e
```

Latest QA report:
```text
TEST_REPORT.md
```

## Production Start
After the backend build completes, Render should run:
```bash
npm --prefix server run start
```

Local production-style start:
```bash
npm run build
npm start
```

## FIFO And Specific Lot Rules
- `FIFO` is an auto-allocation strategy only
- All realized PnL calculations come from persisted `trade_lot_allocations`
- All open positions come from BUY lots minus allocated quantities
- A SELL cannot exceed available shares
- For `SPECIFIC`, allocation quantity sum must equal SELL quantity
- For `SPECIFIC`, each allocation must reference a BUY trade of the same ticker, and the BUY trade date cannot be later than the SELL trade date
