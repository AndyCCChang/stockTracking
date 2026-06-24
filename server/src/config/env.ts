import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type RuntimeMode = "development" | "test" | "production";

type DatabaseMode = "postgres" | "memory";

function loadDotEnvFile(path: string) {
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function loadEnvironmentFiles() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const serverDir = resolve(currentDir, "../..");
  const projectRoot = resolve(serverDir, "..");
  const candidates = [
    join(projectRoot, ".env"),
    join(serverDir, ".env"),
    join(process.cwd(), ".env")
  ];

  for (const candidate of candidates) {
    loadDotEnvFile(candidate);
  }
}

loadEnvironmentFiles();

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
const configuredDatabaseMode = getStringEnv("DATABASE_MODE");
const databaseMode: DatabaseMode = configuredDatabaseMode === "memory" ? "memory" : "postgres";
const defaultLocalDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/stock_tracking";
const configuredDatabaseUrl = getStringEnv("DATABASE_URL") ?? (!isProduction ? defaultLocalDatabaseUrl : null);

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
