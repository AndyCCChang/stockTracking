type RuntimeMode = "development" | "test" | "production";

type DatabaseMode = "postgres" | "memory";

function getRuntimeMode(): RuntimeMode {
  const value = process.env.NODE_ENV;
  if (value === "production" || value === "test") {
    return value;
  }
  return "development";
}

function getStringEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function getRequiredEnv(name: string, fallback?: string) {
  const value = getStringEnv(name) ?? fallback ?? null;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getPort() {
  const raw = getStringEnv("PORT") ?? "4000";
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid PORT value: ${raw}`);
  }
  return parsed;
}

function getCorsOrigins() {
  return (getStringEnv("CORS_ORIGIN") ?? getStringEnv("FRONTEND_URL") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const runtimeMode = getRuntimeMode();
const isProduction = runtimeMode === "production";
const isTest = runtimeMode === "test";
const configuredDatabaseUrl = getStringEnv("DATABASE_URL");
const databaseMode: DatabaseMode = configuredDatabaseUrl ? "postgres" : isProduction || isTest ? "postgres" : "memory";

export const env = {
  nodeEnv: runtimeMode,
  isProduction,
  isTest,
  port: getPort(),
  databaseMode,
  databaseUrl: databaseMode === "postgres"
    ? getRequiredEnv("DATABASE_URL")
    : null,
  jwtSecret: getRequiredEnv(
    "JWT_SECRET",
    isProduction ? undefined : "stock-tracking-dev-secret"
  ),
  corsOrigins: getCorsOrigins(),
  priceProvider: getStringEnv("PRICE_PROVIDER") ?? "auto",
  finnhubApiKey: getStringEnv("FINNHUB_API_KEY"),
  alphaVantageApiKey: getStringEnv("ALPHA_VANTAGE_API_KEY")
} as const;
