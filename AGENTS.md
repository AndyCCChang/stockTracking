# Project Rules

## Goal
Build a personal US stock trading journal and P&L dashboard website.

## Stack
- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend: Node.js + Express + TypeScript
- Database: SQLite
- Charts: Recharts
- Date library: dayjs
- HTTP client: axios

## Trading Rules
- The system must support two sell lot matching modes:
  1. FIFO auto allocation
  2. Specific lot manual allocation
- FIFO is only an auto-allocation strategy
- Realized P&L must always be calculated from persisted sell-to-buy allocations
- Open positions must always be calculated from remaining open buy lots
- A SELL trade must never exceed available shares
- Allocation quantity sum must equal sell quantity
- Buy lots allocated to a sell must match ticker and must not have a later trade date than the sell

## Code Rules
- Keep client and server separated
- Use modular structure
- Add types for important models
- Add validation on both frontend and backend
- Use DB transactions for sell create/update/delete operations that affect allocations
- Use a replaceable price service
- Avoid broken imports
- Keep the project runnable at every step

## Output Rules
- Make direct file changes
- Do not leave TODOs for core logic
- Prefer simple and maintainable implementations
- After each task, summarize:
  1. What was added
  2. What was changed
  3. How to run it
  4. Any assumptions made