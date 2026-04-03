const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error('E2E requires DATABASE_URL to be set to a reachable PostgreSQL database.');
  console.error('Example: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/stock_tracking npm run test:e2e');
  process.exit(1);
}
