export interface PriceService {
  getLatestPrice(symbol: string): Promise<number>;
}

const fallbackPrices: Record<string, number> = {
  AAPL: 215.34,
  MSFT: 421.13,
  NVDA: 118.22,
  TSLA: 172.64,
  SPY: 514.88
};

export class StaticPriceService implements PriceService {
  async getLatestPrice(symbol: string): Promise<number> {
    return fallbackPrices[symbol.toUpperCase()] ?? 100;
  }
}

export const priceService: PriceService = new StaticPriceService();
