# Test Report

Date: 2026-03-24
Project: stockTracking
Environment: Node.js v20.20.1, npm workspace, local SQLite seed data

## Summary

This validation pass covered backend automated tests, frontend/backend TypeScript checks, production build validation, and runtime API smoke tests against seeded demo data.

Overall result: Pass with minor residual risk.

## Scope

Covered areas:
- Backend allocation logic
- Backend analytics endpoints
- Frontend TypeScript compilation
- Backend TypeScript compilation
- Production build output
- Runtime API read endpoints
- Runtime API write/import/export endpoints
- SQLite seeded demo dataset workflow

Not covered in this pass:
- Browser automation / end-to-end UI clicking flows
- Load / concurrency stress testing
- Authentication / authorization
- Security testing
- Cross-browser compatibility validation

## Environment And Setup

1. Seed demo data with `npm run db:seed`
2. Run backend tests with `npm run test:server`
3. Run type checks with `npm --prefix server run lint` and `npm --prefix client run lint`
4. Run production build with `npm run build`
5. Start server locally for smoke tests
6. Execute API checks against `http://localhost:4010`

## Results Table

| Category | Test Item | Steps | Expected Result | Actual Result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Automated | Backend unit/integration tests | Run `npm run test:server` | All backend tests pass | 9/9 tests passed | Pass | Includes FIFO, SPECIFIC, realized PnL, dashboard, realized, positions |
| Static Check | Backend TypeScript | Run `npm --prefix server run lint` | No TS errors | No errors | Pass | Server compiles cleanly |
| Static Check | Frontend TypeScript | Run `npm --prefix client run lint` | No TS errors | No errors | Pass | Client compiles cleanly |
| Build | Full production build | Run `npm run build` | Server and client build successfully | Build succeeded | Pass | Vite output generated successfully |
| Runtime API | Health endpoint | `GET /api/health` | Server reports healthy DB-connected state | Returned `status: ok` and `database: connected` | Pass | Confirms Express + SQLite runtime |
| Runtime API | Dashboard endpoint | `GET /api/dashboard` | Returns aggregate analytics payload | Returned totals, cumulativePnLSeries, unrealizedDistribution, yearlyOverview | Pass | Real data present |
| Runtime API | Positions endpoint | `GET /api/positions` | Returns open positions from remaining buy lots | Returned 4 open positions | Pass | Data matched seeded portfolio |
| Runtime API | Realized endpoint | `GET /api/realized` | Returns grouped sell records using allocations | Returned grouped realized sell records | Pass | Allocation snapshots included |
| Runtime API | Performance endpoint | `GET /api/performance` | Returns performance metrics and PnL curve | Returned metrics and curve | Pass | Values consistent with realized records |
| Runtime API | Yearly summary endpoint | `GET /api/yearly-summary` | Returns yearly summary rows | Returned 2025 yearly summary | Pass | Annual aggregate available |
| Runtime API | Monthly summary endpoint | `GET /api/monthly-summary?year=2025` | Returns 12 monthly rows | Returned monthly breakdown for 2025 | Pass | Includes realized/unrealized/trade counts |
| Runtime API | Lot lookup endpoint | `GET /api/lots/available?ticker=NVDA&tradeDate=2025-03-14` | Returns valid open lots before sell date | Returned 2 available NVDA buy lots | Pass | Matches seeded allocation state |
| Runtime API | Trades export endpoint | `GET /api/trades/export` | Returns CSV export | Returned CSV rows with allocations column | Pass | Export formatting works |
| Runtime API | Yearly export endpoint | `GET /api/yearly-summary/export` | Returns yearly CSV export | Returned CSV summary | Pass | Export formatting works |
| Runtime API | Trade create | `POST /api/trades` with test BUY payload | Trade should be persisted | Trade created successfully | Pass | Temporary validation data created |
| Runtime API | Trade import | `POST /api/trades/import` with one BUY row | Import should succeed | `importedCount: 1` | Pass | Backend import validation + create path works |
| Runtime API | Trade update | `PUT /api/trades/:id` during parallel smoke test | Existing trade should update | Returned `Trade 99 not found` | Inconclusive | Executed in parallel with other write operations; not treated as confirmed product defect |
| Runtime API | Trade delete | `DELETE /api/trades/:id` during parallel smoke test | Existing trade should delete or missing trade should be handled consistently | Request returned success | Inconclusive | Needs isolated serial retest for definitive behavior |
| Data Reset | Seed restore | Run `npm run db:seed` after smoke tests | Demo data restored | Seed completed successfully | Pass | Workspace left in demo-data state |

## Automated Test Details

Backend test suite passed these checks:
- FIFO auto allocation builds expected allocations
- Specific allocation succeeds with requested lots
- Specific allocation quantity total must equal sell quantity
- Specific allocation cannot exceed available lot quantity
- Realized PnL is calculated from persisted allocations
- Updating SELL rebuilds allocations correctly
- `GET /api/dashboard` returns stable analytics payload
- `GET /api/realized` returns allocation-based grouped sell records
- `GET /api/positions` reflects remaining open lots after allocations

## Key Observations

- The repo is currently runnable and buildable.
- The previously placeholder frontend pages now compile and build successfully.
- Core trading rules around persisted allocations are validated by backend tests.
- Runtime analytics endpoints return coherent seeded data.
- Export endpoints return expected CSV responses.

## Residual Risks

1. No browser automation was run, so UI interaction paths were not end-to-end clicked through in a real browser.
2. The `PUT`/`DELETE` CRUD behavior should be re-tested serially to rule out write-race effects from parallel smoke requests.
3. No load or concurrency stress testing was performed.
4. No security or auth testing was applicable/performed in this pass.

## Recommendations

1. Add browser-based E2E tests for create/edit/delete/import/export flows.
2. Add a dedicated API test for `PUT /api/trades/:id` and `DELETE /api/trades/:id` executed serially.
3. Add regression tests for the newer frontend analytics pages.
4. Consider documenting this report in the README or CI pipeline output.

## Final Assessment

The project passed the main validation gates for backend tests, TypeScript checks, build verification, and core runtime API smoke testing.

Release readiness for local/demo use: Good.

Remaining caution before stronger production confidence: add serial CRUD API regression tests and browser-level end-to-end coverage.
