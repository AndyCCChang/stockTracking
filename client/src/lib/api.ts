import axios from 'axios';

export type TradeType = 'BUY' | 'SELL';
export type LotSelectionMethod = 'FIFO' | 'SPECIFIC';

export type HealthResponse = {
  status: 'ok';
  service: string;
  database: string;
  timestamp: string;
};

export type LatestPriceResponse = {
  ticker: string;
  price: number | null;
  asOf: string;
  provider: string;
  source: 'live' | 'cache' | 'unavailable';
  error: string | null;
};

export type TradeAllocationRecord = {
  id: number;
  sellTradeId: number;
  buyTradeId: number;
  quantity: number;
  createdAt: string;
  buyPriceSnapshot: number | null;
  buyTradeDateSnapshot: string | null;
};

export type TradeRecord = {
  id: number;
  ticker: string;
  tradeDate: string;
  type: TradeType;
  quantity: number;
  price: number;
  fee: number;
  notes: string | null;
  currency: string;
  lotSelectionMethod: LotSelectionMethod;
  createdAt: string;
  updatedAt: string;
  allocations: TradeAllocationRecord[];
};

export type TradeListResponse = {
  items: TradeRecord[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export type TradePayload = {
  ticker: string;
  tradeDate: string;
  type: TradeType;
  quantity: number;
  price: number;
  fee: number;
  notes?: string | null;
  currency?: string;
  lotSelectionMethod?: LotSelectionMethod;
  allocations?: Array<{
    buyTradeId: number;
    quantity: number;
  }>;
};

export type CsvTradeAllocationInput = {
  buyTradeId?: number;
  buyTradeRef?: string;
  quantity: number;
};

export type CsvTradeImportRow = {
  importRef?: string;
  ticker: string;
  tradeDate: string;
  type: TradeType;
  quantity: number;
  price: number;
  fee: number;
  notes?: string | null;
  currency?: string;
  lotSelectionMethod?: LotSelectionMethod;
  allocations?: CsvTradeAllocationInput[];
};

export type CsvTradeImportResult = {
  importedCount: number;
  importedTradeIds: number[];
};

export type AvailableLot = {
  buyTradeId: number;
  tradeDate: string;
  ticker: string;
  originalQuantity: number;
  allocatedQuantity: number;
  availableQuantity: number;
  price: number;
  fee: number;
  currency: string;
};

export type RealizedAllocationItem = {
  buyTradeId: number;
  buyTradeDate: string | null;
  quantity: number;
  buyPrice: number | null;
  costBasis: number;
};

export type RealizedTradeItem = {
  sellTradeId: number;
  sellDate: string;
  ticker: string;
  quantity: number;
  averageCost: number;
  sellPrice: number;
  fee: number;
  realizedPnL: number;
  returnRate: number;
  lotSelectionMethod: LotSelectionMethod;
  allocations: RealizedAllocationItem[];
  currency: string;
};

export type PositionItem = {
  ticker: string;
  quantity: number;
  averageCost: number;
  latestPrice: number | null;
  costBasis: number;
  marketValue: number | null;
  unrealizedPnL: number | null;
  unrealizedReturnRate: number | null;
  openLotsCount: number;
  currency: string;
};

export type TimeSeriesPoint = {
  label: string;
  value: number;
};

export type DistributionPoint = {
  ticker: string;
  value: number;
};

export type YearlyOverviewItem = {
  year: string;
  realizedPnL: number;
  unrealizedPnL: number | null;
  tradeCount: number;
  grossBuyAmount: number;
  grossSellAmount: number;
  returnRate: number | null;
};

export type DashboardResponse = {
  totalCostBasis: number;
  totalMarketValue: number | null;
  totalRealizedPnL: number;
  totalUnrealizedPnL: number | null;
  totalReturnRate: number | null;
  currentYearRealizedPnL: number;
  currentYearUnrealizedPnL: number | null;
  openPositionCount: number;
  cumulativePnLSeries: TimeSeriesPoint[];
  unrealizedDistribution: DistributionPoint[];
  yearlyOverview: YearlyOverviewItem[];
};

export type PerformanceResponse = {
  winRate: number;
  totalClosedTrades: number;
  winningTrades: number;
  losingTrades: number;
  averageWin: number;
  averageLoss: number;
  maxWin: number;
  maxLoss: number;
  profitFactor: number;
  cumulativePnLCurve: TimeSeriesPoint[];
};

export type MonthlySummaryItem = {
  month: string;
  realizedPnL: number;
  unrealizedPnL: number | null;
  tradeCount: number;
  buyAmount: number;
  sellAmount: number;
  returnRate: number | null;
};

export type MonthlySummaryResponse = {
  year: string;
  months: MonthlySummaryItem[];
};

const api = axios.create({
  baseURL: '/api',
  timeout: 5000
});

function normalizeErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const apiMessage = error.response?.data?.message;
    if (typeof apiMessage === 'string' && apiMessage.length > 0) {
      return apiMessage;
    }

    if (typeof error.message === 'string' && error.message.length > 0) {
      return error.message;
    }
  }

  return error instanceof Error ? error.message : 'Request failed';
}

export function getTradesExportUrl() {
  return '/api/trades/export';
}

export function getYearlySummaryExportUrl() {
  return '/api/yearly-summary/export';
}

export async function fetchHealth() {
  const { data } = await api.get<HealthResponse>('/health');
  return data;
}

export async function fetchLatestPrice(ticker: string) {
  try {
    const { data } = await api.get<LatestPriceResponse>('/prices/latest', {
      params: { ticker }
    });
    return data;
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function fetchDashboard() {
  try {
    const { data } = await api.get<DashboardResponse>('/dashboard');
    return data;
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function fetchTrades() {
  try {
    const { data } = await api.get<TradeListResponse>('/trades', {
      params: {
        page: 1,
        pageSize: 100,
        sortBy: 'tradeDate',
        sortOrder: 'desc'
      }
    });
    return data;
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function createTrade(payload: TradePayload) {
  try {
    const { data } = await api.post<TradeRecord>('/trades', payload);
    return data;
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function updateTrade(id: number, payload: TradePayload) {
  try {
    const { data } = await api.put<TradeRecord>(`/trades/${id}`, payload);
    return data;
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function deleteTrade(id: number) {
  try {
    await api.delete(`/trades/${id}`);
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function importTrades(rows: CsvTradeImportRow[]) {
  try {
    const { data } = await api.post<CsvTradeImportResult>('/trades/import', { rows });
    return data;
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function fetchAvailableLots(ticker: string, tradeDate: string) {
  try {
    const { data } = await api.get<AvailableLot[]>('/lots/available', {
      params: {
        ticker,
        tradeDate
      }
    });
    return data;
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function fetchPositions() {
  try {
    const { data } = await api.get<PositionItem[]>('/positions');
    return data;
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function fetchPerformance() {
  try {
    const { data } = await api.get<PerformanceResponse>('/performance');
    return data;
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function fetchYearlySummary() {
  try {
    const { data } = await api.get<YearlyOverviewItem[]>('/yearly-summary');
    return data;
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function fetchMonthlySummary(year: string) {
  try {
    const { data } = await api.get<MonthlySummaryResponse>('/monthly-summary', {
      params: { year }
    });
    return data;
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function fetchRealizedTrades() {
  try {
    const { data } = await api.get<RealizedTradeItem[]>('/realized');
    return data;
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}
