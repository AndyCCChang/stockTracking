import dayjs from 'dayjs';
import { getAllTradeAllocations, getAllTrades } from '../db/tradeRepository.js';
import {
  buildCumulativePnLSeries,
  calculateOpenPositionsFromLots,
  calculatePerformanceMetrics,
  calculateRealizedPnLFromAllocations,
  calculateUnrealizedPnL,
  calculateYearlySummary
} from '../lib/fifo.js';
import { getLatestPrice, getLatestPriceQuote, type LatestPriceQuote } from './priceService.js';
import type {
  DashboardResponse,
  DistributionPoint,
  MonthlySummaryItem,
  MonthlySummaryResponse,
  PositionApiItem,
  PositionSummary,
  RealizedApiItem,
  TimeSeriesPoint,
  TradeLotAllocationRecord,
  TradeRecord,
  UnrealizedSummary,
  YearlySummary
} from '../types.js';

function round(value: number) {
  return Number(value.toFixed(2));
}

function roundNullable(value: number | null) {
  return value == null ? null : round(value);
}

function sumNullable(values: Array<number | null>) {
  let sum = 0;

  for (const value of values) {
    if (value == null) {
      return null;
    }

    sum += value;
  }

  return sum;
}

async function getDataset(userId: number) {
  const [trades, allocations] = await Promise.all([getAllTrades(userId), getAllTradeAllocations(userId)]);
  return { trades, allocations };
}

function toPositionApiItem(item: UnrealizedSummary, openLotsCount: number, quote?: LatestPriceQuote): PositionApiItem {
  const previousClose = quote?.previousClose ?? null;
  const todayPerShareChange = item.marketPrice == null || previousClose == null ? null : item.marketPrice - previousClose;
  const todaysPnL = todayPerShareChange == null ? null : todayPerShareChange * item.quantity;
  const todaysPnLRate =
    todayPerShareChange == null || previousClose == null || previousClose === 0 ? null : todayPerShareChange / previousClose;

  return {
    ticker: item.ticker,
    quantity: round(item.quantity),
    averageCost: round(item.averageCost),
    latestPrice: roundNullable(item.marketPrice),
    previousClose: roundNullable(previousClose),
    costBasis: round(item.costBasis),
    marketValue: roundNullable(item.marketValue),
    unrealizedPnL: roundNullable(item.unrealizedPnL),
    unrealizedReturnRate: roundNullable(item.unrealizedReturnRate),
    todaysPnL: roundNullable(todaysPnL),
    todaysPnLRate: roundNullable(todaysPnLRate),
    openLotsCount,
    currency: item.currency
  };
}

function buildOpenLotsCountMap(positions: PositionSummary[]) {
  return new Map(positions.map((position) => [position.ticker, position.lots.length]));
}

function buildRealizedItems(trades: TradeRecord[], allocations: TradeLotAllocationRecord[]): RealizedApiItem[] {
  const realized = calculateRealizedPnLFromAllocations(trades, allocations);
  const tradesById = new Map(trades.map((trade) => [trade.id, trade]));
  const grouped = new Map<number, RealizedApiItem>();

  for (const match of realized.matches) {
    const sellTrade = tradesById.get(match.sellTradeId);
    if (!sellTrade) {
      continue;
    }

    const existing = grouped.get(match.sellTradeId);
    if (!existing) {
      grouped.set(match.sellTradeId, {
        sellTradeId: match.sellTradeId,
        sellDate: match.sellDate,
        ticker: match.ticker,
        quantity: round(sellTrade.quantity),
        averageCost: 0,
        sellPrice: round(match.sellPrice),
        fee: round(sellTrade.fee),
        realizedPnL: 0,
        returnRate: 0,
        lotSelectionMethod: sellTrade.lotSelectionMethod,
        allocations: [],
        currency: match.currency
      });
    }

    const item = grouped.get(match.sellTradeId);
    if (!item) {
      continue;
    }

    item.allocations.push({
      buyTradeId: match.buyTradeId,
      buyTradeDate: match.buyTradeDateSnapshot ?? match.buyTradeDate,
      quantity: round(match.allocatedQuantity),
      buyPrice: match.buyPriceSnapshot == null ? null : round(match.buyPriceSnapshot),
      costBasis: round(match.costBasis)
    });
    item.realizedPnL = round(item.realizedPnL + match.realizedPnL);
  }

  return [...grouped.values()]
    .map((item) => {
      const totalCostBasis = item.allocations.reduce((sum, allocation) => sum + allocation.costBasis, 0);
      const quantity = item.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
      return {
        ...item,
        quantity: round(quantity),
        averageCost: quantity === 0 ? 0 : round(totalCostBasis / quantity),
        returnRate: totalCostBasis === 0 ? 0 : round(item.realizedPnL / totalCostBasis),
        allocations: item.allocations.sort((left, right) => {
          if (left.buyTradeDate === right.buyTradeDate) {
            return left.buyTradeId - right.buyTradeId;
          }
          return (left.buyTradeDate ?? '').localeCompare(right.buyTradeDate ?? '');
        })
      } satisfies RealizedApiItem;
    })
    .sort((left, right) => left.sellDate.localeCompare(right.sellDate) || left.sellTradeId - right.sellTradeId);
}

function buildYearlyOverview(
  trades: TradeRecord[],
  allocations: TradeLotAllocationRecord[],
  unrealizedItems: UnrealizedSummary[]
): YearlySummary[] {
  return calculateYearlySummary(trades, allocations, unrealizedItems).map((item) => ({
    year: item.year,
    realizedPnL: round(item.realizedPnL),
    unrealizedPnL: roundNullable(item.unrealizedPnL),
    tradeCount: item.tradeCount,
    grossBuyAmount: round(item.grossBuyAmount),
    grossSellAmount: round(item.grossSellAmount),
    returnRate: roundNullable(item.returnRate)
  }));
}

function buildUnrealizedDistribution(items: UnrealizedSummary[]): DistributionPoint[] {
  return items
    .filter((item) => item.unrealizedPnL != null)
    .map((item) => ({ ticker: item.ticker, value: round(item.unrealizedPnL ?? 0) }));
}

function createEmptyDashboard(): DashboardResponse {
  return {
    totalCostBasis: 0,
    totalMarketValue: 0,
    totalRealizedPnL: 0,
    totalUnrealizedPnL: 0,
    totalReturnRate: 0,
    currentYearRealizedPnL: 0,
    currentYearUnrealizedPnL: 0,
    openPositionCount: 0,
    cumulativePnLSeries: [],
    unrealizedDistribution: [],
    yearlyOverview: []
  };
}

export async function getDashboardAnalytics(userId: number): Promise<DashboardResponse> {
  const { trades, allocations } = await getDataset(userId);
  if (trades.length === 0) {
    return createEmptyDashboard();
  }

  const realized = calculateRealizedPnLFromAllocations(trades, allocations);
  const unrealized = await calculateUnrealizedPnL(trades, allocations, getLatestPrice);
  const yearlyOverview = buildYearlyOverview(trades, allocations, unrealized);
  const totalCostBasis = unrealized.reduce((sum, item) => sum + item.costBasis, 0);
  const totalMarketValue = sumNullable(unrealized.map((item) => item.marketValue));
  const totalUnrealizedPnL = sumNullable(unrealized.map((item) => item.unrealizedPnL));
  const currentYear = dayjs().format('YYYY');
  const currentYearItem = yearlyOverview.find((item) => item.year === currentYear);
  const currentYearRealizedPnL = currentYearItem?.realizedPnL ?? 0;
  const currentYearUnrealizedPnL = currentYearItem ? currentYearItem.unrealizedPnL : 0;

  return {
    totalCostBasis: round(totalCostBasis),
    totalMarketValue: roundNullable(totalMarketValue),
    totalRealizedPnL: round(realized.totalRealizedPnL),
    totalUnrealizedPnL: roundNullable(totalUnrealizedPnL),
    totalReturnRate:
      totalUnrealizedPnL == null ? null : totalCostBasis === 0 ? 0 : round((realized.totalRealizedPnL + totalUnrealizedPnL) / totalCostBasis),
    currentYearRealizedPnL,
    currentYearUnrealizedPnL: roundNullable(currentYearUnrealizedPnL),
    openPositionCount: calculateOpenPositionsFromLots(trades, allocations).length,
    cumulativePnLSeries: buildCumulativePnLSeries(realized.matches).map((point) => ({
      label: point.label,
      value: round(point.value)
    })),
    unrealizedDistribution: buildUnrealizedDistribution(unrealized),
    yearlyOverview
  };
}

export async function getPositionsAnalytics(userId: number): Promise<PositionApiItem[]> {
  const { trades, allocations } = await getDataset(userId);
  if (trades.length === 0) {
    return [];
  }

  const positionSummaries = calculateOpenPositionsFromLots(trades, allocations);
  const openLotsCountMap = buildOpenLotsCountMap(positionSummaries);
  const unrealized = await calculateUnrealizedPnL(trades, allocations, getLatestPrice);
  const quotes = await Promise.all(unrealized.map(async (item) => [item.ticker, await getLatestPriceQuote(item.ticker)] as const));
  const quotesByTicker = new Map(quotes);

  return unrealized.map((item) => toPositionApiItem(item, openLotsCountMap.get(item.ticker) ?? 0, quotesByTicker.get(item.ticker)));
}

export async function getRealizedAnalytics(userId: number): Promise<RealizedApiItem[]> {
  const { trades, allocations } = await getDataset(userId);
  if (trades.length === 0) {
    return [];
  }

  return buildRealizedItems(trades, allocations);
}

export async function getPerformanceAnalytics(userId: number) {
  const { trades, allocations } = await getDataset(userId);
  if (trades.length === 0) {
    return {
      winRate: 0,
      totalClosedTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      averageWin: 0,
      averageLoss: 0,
      maxWin: 0,
      maxLoss: 0,
      profitFactor: 0,
      cumulativePnLCurve: [] as TimeSeriesPoint[]
    };
  }

  const metrics = calculatePerformanceMetrics(trades, allocations);
  return {
    winRate: round(metrics.winRate),
    totalClosedTrades: metrics.totalClosedTrades,
    winningTrades: metrics.winningTrades,
    losingTrades: metrics.losingTrades,
    averageWin: round(metrics.averageWin),
    averageLoss: round(metrics.averageLoss),
    maxWin: round(metrics.maxWin),
    maxLoss: round(metrics.maxLoss),
    profitFactor: Number.isFinite(metrics.profitFactor) ? round(metrics.profitFactor) : 0,
    cumulativePnLCurve: metrics.cumulativePnLCurve.map((point) => ({ label: point.label, value: round(point.value) }))
  };
}

export async function getYearlySummaryAnalytics(userId: number): Promise<YearlySummary[]> {
  const { trades, allocations } = await getDataset(userId);
  if (trades.length === 0) {
    return [];
  }

  const unrealized = await calculateUnrealizedPnL(trades, allocations, getLatestPrice);
  return buildYearlyOverview(trades, allocations, unrealized);
}

export async function getMonthlySummaryAnalytics(userId: number, year: string): Promise<MonthlySummaryResponse> {
  const { trades, allocations }: { trades: TradeRecord[]; allocations: TradeLotAllocationRecord[] } = await getDataset(userId);
  const realizedItems = buildRealizedItems(trades, allocations);
  const unrealized = await calculateUnrealizedPnL(trades, allocations, getLatestPrice);
  const currentYear = dayjs().format('YYYY');
  const currentMonth = dayjs().format('MM');
  const currentYearUnrealized = sumNullable(unrealized.map((item) => item.unrealizedPnL));

  const months = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    const prefix = `${year}-${month}`;
    const monthTrades: TradeRecord[] = trades.filter((trade) => trade.tradeDate.startsWith(prefix));
    const realizedPnL = realizedItems.filter((item) => item.sellDate.startsWith(prefix)).reduce((sum, item) => sum + item.realizedPnL, 0);
    const buyAmount = monthTrades.filter((trade) => trade.type === 'BUY').reduce((sum, trade) => sum + trade.quantity * trade.price, 0);
    const sellAmount = monthTrades.filter((trade) => trade.type === 'SELL').reduce((sum, trade) => sum + trade.quantity * trade.price, 0);
    const unrealizedPnL = year === currentYear && month === currentMonth ? currentYearUnrealized : 0;
    const denominator = buyAmount === 0 ? sellAmount : buyAmount;

    return {
      month,
      realizedPnL: round(realizedPnL),
      unrealizedPnL: roundNullable(unrealizedPnL),
      tradeCount: monthTrades.length,
      buyAmount: round(buyAmount),
      sellAmount: round(sellAmount),
      returnRate: unrealizedPnL == null ? null : denominator === 0 ? 0 : round((realizedPnL + unrealizedPnL) / denominator)
    } satisfies MonthlySummaryItem;
  });

  return { year, months };
}
