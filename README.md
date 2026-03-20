# Stock Tracking Journal

A personal US stock trading journal and P&L dashboard with a React + Vite client and an Express + SQLite server.

## What was added
- Full-stack monorepo structure for `client` and `server`.
- SQLite-backed trade journal API with validation, FIFO realized P&L, positions, yearly performance, metrics, and CSV import/export.
- React dashboard with dark mode, charts, trade CRUD, and analytics pages.

## What was changed
- Bootstrapped the repository from an empty state into a runnable project.
- Added modular trade math, replaceable price service abstraction, and separated frontend/backend packages.

## How to run it
1. `Use Node 20+ and npm 10+` (`nvm use` will pick up `.nvmrc` if you use `nvm`).
2. `npm install`
3. `npm run dev`
4. Open `http://localhost:5173`

## Notes
- The current toolchain uses modern syntax and dev tools like Vite 6 and tsx 4, so Node 10 / npm 6 will fail during startup.
- If you only want one side of the app, use `npm run dev:server` or `npm run dev:client` from the repo root.

## Assumptions made
- Latest prices use a static fallback price service so the app remains runnable without external API keys.
- CSV import expects a simple comma-separated header row matching the exported column names.
