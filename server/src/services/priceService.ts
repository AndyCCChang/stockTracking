export type PriceProviderAdapter = {
  getLatestPrice: (ticker: string) => Promise<number>;
};

const mockPriceMap: Record<string, number> = {
  AAPL: 212.35,
  TSLA: 248.9,
  NVDA: 812.45,
  MSFT: 428.15,
  AMZN: 188.7,
  META: 521.2
};

class MockPriceService implements PriceProviderAdapter {
  async getLatestPrice(ticker: string) {
    return mockPriceMap[ticker.toUpperCase()] ?? 100;
  }
}

export function createPriceService(): PriceProviderAdapter {
  return new MockPriceService();
}

const priceService = createPriceService();

export async function getLatestPrice(ticker: string) {
  return priceService.getLatestPrice(ticker);
}
