export const TRADE_TYPES = ['BUY', 'SELL'] as const;
export const LOT_SELECTION_METHODS = ['FIFO', 'SPECIFIC'] as const;
export const TRADE_SORT_FIELDS = [
  'id',
  'ticker',
  'tradeDate',
  'type',
  'quantity',
  'price',
  'fee',
  'createdAt',
  'updatedAt'
] as const;
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type TradeType = (typeof TRADE_TYPES)[number];
export type LotSelectionMethod = (typeof LOT_SELECTION_METHODS)[number];
export type TradeSortField = (typeof TRADE_SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

export type UserRecord = {
  id: number;
  email: string;
  passwordHash: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicUser = {
  id: number;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthTokenPayload = {
  userId: number;
  email: string;
};

export type AuthenticatedRequestUser = AuthTokenPayload;

export type RegisterInput = {
  email: string;
  password: string;
  name?: string | null;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type AuthResponse = {
  token: string;
  user: PublicUser;
};

export type TradeLotAllocationInput = {
  buyTradeId: number;
  quantity: number;
};

export type CsvTradeAllocationInput = {
  buyTradeId?: number;
  buyTradeRef?: string;
  quantity: number;
};

export type TradeLotAllocationRecord = {
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
  allocations: TradeLotAllocationRecord[];
};

export type TradeInput = {
  ticker: string;
  tradeDate: string;
  type: TradeType;
  quantity: number;
  price: number;
  fee?: number;
  notes?: string | null;
  currency?: string;
  lotSelectionMethod?: LotSelectionMethod;
  allocations?: TradeLotAllocationInput[];
};

export type CsvTradeImportRow = {
  importRef?: string;
  ticker: string;
  tradeDate: string;
  type: TradeType;
  quantity: number;
  price: number;
  fee?: number;
  notes?: string | null;
  currency?: string;
  lotSelectionMethod?: LotSelectionMethod;
  allocations?: CsvTradeAllocationInput[];
};

export type CsvTradeImportResult = {
  importedCount: number;
  importedTradeIds: number[];
};

export type TradeFilters = {
  ticker?: string;
  type?: TradeType;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
  sortBy: TradeSortField;
  sortOrder: SortOrder;
};

export type TradeListResult = {
  items: TradeRecord[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export type AvailableLot = {
  buyTradeId: number;
  ticker: string;
  tradeDate: string;
  originalQuantity: number;
  allocatedQuantity: number;
  availableQuantity: number;
  price: number;
  fee: number;
  currency: string;
};

export type PositionLot = AvailableLot;

export type PositionSummary = {
  ticker: string;
  quantity: number;
  averageCost: number;
  totalCost: number;
  currency: string;
  lots: PositionLot[];
};

export type RealizedMatch = {
  sellTradeId: number;
  buyTradeId: number;
  sellDate: string;
  buyTradeDate: string;
  ticker: string;
  allocatedQuantity: number;
  sellPrice: number;
  averageCost: number;
  proceeds: number;
  costBasis: number;
  fee: number;
  realizedPnL: number;
  returnRate: number;
  currency: string;
  buyPriceSnapshot: number | null;
  buyTradeDateSnapshot: string | null;
};

export type RealizedPnLResult = {
  matches: RealizedMatch[];
  totalRealizedPnL: number;
};

export type UnrealizedSummary = {
  ticker: string;
  quantity: number;
  marketPrice: number | null;
  averageCost: number;
  marketValue: number | null;
  costBasis: number;
  unrealizedPnL: number | null;
  unrealizedReturnRate: number | null;
  currency: string;
};

export type YearlySummary = {
  year: string;
  realizedPnL: number;
  unrealizedPnL: number | null;
  tradeCount: number;
  grossBuyAmount: number;
  grossSellAmount: number;
  returnRate: number | null;
};

export type TimeSeriesPoint = {
  label: string;
  value: number;
};

export type PerformanceMetrics = {
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

export type DistributionPoint = {
  ticker: string;
  value: number;
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
  yearlyOverview: YearlySummary[];
};

export type PositionApiItem = {
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

export type RealizedAllocationApiItem = {
  buyTradeId: number;
  buyTradeDate: string | null;
  quantity: number;
  buyPrice: number | null;
  costBasis: number;
};

export type RealizedApiItem = {
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
  allocations: RealizedAllocationApiItem[];
  currency: string;
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
