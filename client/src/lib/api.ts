import axios from 'axios';

export type TradeType = 'BUY' | 'SELL';
export type LotSelectionMethod = 'FIFO' | 'SPECIFIC';

export type AuthUser = {
  id: number;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RegisterPayload = {
  email: string;
  password: string;
  name?: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type HealthResponse = {
  status: 'ok' | 'degraded';
  service: string;
  database: 'connected' | 'unavailable' | string;
  timestamp: string;
  runtime: {
    nodeEnv: string;
    nodeVersion: string;
    port: number;
  };
  services: {
    databaseDriver: string;
    databaseName: string | null;
    corsConfigured: boolean;
    priceProvider: string;
    message: string | null;
  };
};

export type LatestPriceResponse = {
  ticker: string;
  price: number | null;
  previousClose: number | null;
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
  previousClose: number | null;
  costBasis: number;
  marketValue: number | null;
  unrealizedPnL: number | null;
  unrealizedReturnRate: number | null;
  todaysPnL: number | null;
  todaysPnLRate: number | null;
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

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const apiBaseUrl = configuredApiUrl && configuredApiUrl.length > 0 ? configuredApiUrl.replace(/\/$/, '') : '/api';

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 5000
});

let authToken: string | null = null;
let unauthorizedHandler: ((message: string) => void) | null = null;

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401 && unauthorizedHandler && authToken) {
      const requestUrl = typeof error.config?.url === 'string' ? error.config.url : '';
      const isAuthRequest = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');
      if (!isAuthRequest) {
        unauthorizedHandler(normalizeUnauthorizedMessage(error));
      }
    }

    return Promise.reject(error);
  }
);

function normalizeUnauthorizedMessage(error: unknown) {
  const message = normalizeErrorMessage(error).trim();
  if (!message) {
    return 'Your session expired or is no longer valid. Please sign in again.';
  }

  const normalizedMessage = message.toLowerCase();
  if (normalizedMessage.includes('token') || normalizedMessage.includes('unauthorized') || normalizedMessage.includes('jwt')) {
    return 'Your session expired or is no longer valid. Please sign in again.';
  }

  return message;
}

function normalizeErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const apiMessage = error.response?.data?.message;
    if (typeof apiMessage === 'string' && apiMessage.trim().length > 0) {
      return apiMessage.trim();
    }

    const status = error.response?.status;
    if (!error.response) {
      return 'Unable to reach the server. Please check your connection and try again.';
    }

    if (status === 400) {
      return 'The request could not be processed. Please review your input and try again.';
    }

    if (status === 401) {
      return 'Your session expired or is no longer valid. Please sign in again.';
    }

    if (status === 403) {
      return 'You do not have permission to perform this action.';
    }

    if (status === 404) {
      return 'The requested resource could not be found.';
    }

    if (status != null && status >= 500) {
      return 'The server ran into an error. Please try again in a moment.';
    }

    if (typeof error.message === 'string' && error.message.trim().length > 0) {
      return error.message.trim();
    }
  }

  return error instanceof Error && error.message.trim().length > 0 ? error.message.trim() : 'Request failed';
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(handler: ((message: string) => void) | null) {
  unauthorizedHandler = handler;
}

export async function register(payload: RegisterPayload) {
  try {
    const { data } = await api.post<AuthResponse>('/auth/register', payload);
    return data;
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function login(payload: LoginPayload) {
  try {
    const { data } = await api.post<AuthResponse>('/auth/login', payload);
    return data;
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function fetchHealth() {
  try {
    const { data } = await api.get<HealthResponse>('/health');
    return data;
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
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

export async function downloadTradesCsv() {
  try {
    const { data } = await api.get<Blob>('/trades/export', { responseType: 'blob' });
    triggerBlobDownload(data, 'trades-export.csv');
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
}

export async function downloadYearlySummaryCsv() {
  try {
    const { data } = await api.get<Blob>('/yearly-summary/export', { responseType: 'blob' });
    triggerBlobDownload(data, 'yearly-summary.csv');
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
