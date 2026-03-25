import YahooFinance from 'yahoo-finance2';

export type SupportedPriceProvider = 'yahoo-finance';
export type PriceQuoteSource = 'live' | 'cache' | 'unavailable';

export type LatestPriceQuote = {
  ticker: string;
  price: number | null;
  asOf: string;
  provider: SupportedPriceProvider;
  source: PriceQuoteSource;
  error: string | null;
};

type PriceCacheEntry = {
  price: number;
  asOf: string;
  expiresAt: number;
};

const CACHE_TTL_MS = 60_000;
const providerName: SupportedPriceProvider = 'yahoo-finance';
const yahooFinance = new YahooFinance();
const priceCache = new Map<string, PriceCacheEntry>();

function normalizeTicker(ticker: string) {
  return ticker.trim().toUpperCase();
}

function getFreshCacheEntry(ticker: string) {
  const cached = priceCache.get(ticker);
  if (!cached) {
    return null;
  }

  if (Date.now() > cached.expiresAt) {
    return null;
  }

  return cached;
}

function getAnyCacheEntry(ticker: string) {
  return priceCache.get(ticker) ?? null;
}

function setCacheEntry(ticker: string, price: number) {
  const asOf = new Date().toISOString();
  priceCache.set(ticker, {
    price,
    asOf,
    expiresAt: Date.now() + CACHE_TTL_MS
  });

  return { price, asOf };
}

function toErrorMessage(error: unknown, ticker: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return `Failed to fetch the latest Yahoo Finance price for ${ticker}`;
}

async function fetchLivePrice(ticker: string) {
  const quote = await yahooFinance.quote(ticker);
  const price = Number((quote as { regularMarketPrice?: number | null }).regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Yahoo Finance did not return a valid current price for ${ticker}`);
  }

  return setCacheEntry(ticker, price);
}

export async function getLatestPriceQuote(ticker: string): Promise<LatestPriceQuote> {
  const normalizedTicker = normalizeTicker(ticker);
  const freshCache = getFreshCacheEntry(normalizedTicker);
  if (freshCache) {
    return {
      ticker: normalizedTicker,
      price: freshCache.price,
      asOf: freshCache.asOf,
      provider: providerName,
      source: 'cache',
      error: null
    };
  }

  try {
    const live = await fetchLivePrice(normalizedTicker);
    return {
      ticker: normalizedTicker,
      price: live.price,
      asOf: live.asOf,
      provider: providerName,
      source: 'live',
      error: null
    };
  } catch (error) {
    const message = toErrorMessage(error, normalizedTicker);
    const fallbackCache = getAnyCacheEntry(normalizedTicker);

    if (fallbackCache) {
      return {
        ticker: normalizedTicker,
        price: fallbackCache.price,
        asOf: fallbackCache.asOf,
        provider: providerName,
        source: 'cache',
        error: message
      };
    }

    return {
      ticker: normalizedTicker,
      price: null,
      asOf: new Date().toISOString(),
      provider: providerName,
      source: 'unavailable',
      error: message
    };
  }
}

export async function getLatestPrice(ticker: string) {
  return (await getLatestPriceQuote(ticker)).price;
}

export function getPriceProviderName() {
  return providerName;
}
