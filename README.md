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
1. `npm install`
2. `npm run dev`
3. Open `http://localhost:5173`

## Assumptions made
- Latest prices use a static fallback price service so the app remains runnable without external API keys.
- CSV import expects a simple comma-separated header row matching the exported column names.
