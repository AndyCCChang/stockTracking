export type TradeSide = 'BUY' | 'SELL';

export interface Trade {
  id: number;
  symbol: string;
  tradeDate: string;
  side: TradeSide;
  quantity: number;
  price: number;
  fees: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface TradeInput {
  symbol: string;
  tradeDate: string;
  side: TradeSide;
  quantity: number;
  price: number;
  fees: number;
  notes: string;
}

export interface PositionSummary {
  symbol: string;
  quantity: number;
  averageCost: number;
  marketPrice: number;
  marketValue: number;
  unrealizedPnL: number;
}

export interface RealizedLot {
  symbol: string;
  sellTradeId: number;
  tradeDate: string;
  quantity: number;
  proceeds: number;
  costBasis: number;
  fees: number;
  realizedPnL: number;
}

export interface PerformanceMetrics {
  totalRealizedPnL: number;
  totalUnrealizedPnL: number;
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
}
