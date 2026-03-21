# Stock Tracking Journal

A phase-1 full-stack project for US stock trade records and profit analysis.

## Tech Stack
- Client: React + TypeScript + Vite + Tailwind CSS
- Server: Node.js + Express + TypeScript
- Database: SQLite
- Charts: Recharts
- Dates: dayjs
- HTTP client: axios

## Phase 1 Scope
- Monorepo folders for `client` and `server`
- Frontend routing skeleton
- Investment dashboard layout shell
- Express app entrypoint
- Health check API at `GET /api/health`
- SQLite connection module

## Project Structure
```text
.
├── client
│   ├── src
│   │   ├── components
│   │   ├── lib
│   │   └── pages
│   ├── package.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── vite.config.ts
├── server
│   ├── src
│   │   ├── db
│   │   └── routes
│   ├── package.json
│   └── tsconfig.json
└── package.json
```

## Requirements
- Node.js 20+
- npm 10+

## Install
```bash
npm install
```

## Run In Development
Start both apps from the repo root:
```bash
npm run dev
```

Start the client only:
```bash
npm run dev:client
```

Start the server only:
```bash
npm run dev:server
```

## Health Check
After the server starts, visit:
```text
http://localhost:4000/api/health
```

Expected response shape:
```json
{
  "status": "ok",
  "service": "stock-tracking-server",
  "database": "connected",
  "timestamp": "2026-03-20T00:00:00.000Z"
}
```
