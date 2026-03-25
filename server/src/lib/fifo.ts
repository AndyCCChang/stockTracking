import dayjs from 'dayjs';
import { InsufficientPositionError, ValidationError } from './errors.js';
import type {
  AvailableLot,
  LotSelectionMethod,
  PerformanceMetrics,
  PositionSummary,
  RealizedMatch,
  RealizedPnLResult,
  TimeSeriesPoint,
  TradeLotAllocationInput,
  TradeLotAllocationRecord,
  TradeRecord,
  UnrealizedSummary,
  YearlySummary
} from '../types.js';

export type PriceProvider = (ticker: string) => number | null | Promise<number | null>;

type AvailableLotState = AvailableLot;

type PersistedAllocationDraft = TradeLotAllocationInput & {
  sellTradeId: number;
  buyPriceSnapshot: number | null;
  buyTradeDateSnapshot: string | null;
};

function sortTrades(trades: TradeRecord[]) {
  return [...trades].sort((left, right) => {
    const dateComparison = left.tradeDate.localeCompare(right.tradeDate);
    if (dateComparison !== 0) {
      return dateComparison;
    }

    const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
    if (createdAtComparison !== 0) {
      return createdAtComparison;
    }

    return left.id - right.id;
  });
}

function toDraftAllocation(sellTradeId: number, lot: AvailableLotState, quantity: number): PersistedAllocationDraft {
  return {
    sellTradeId,
    buyTradeId: lot.buyTradeId,
    quantity,
    buyPriceSnapshot: lot.price,
    buyTradeDateSnapshot: lot.tradeDate
  };
}

function getSpecificAllocationMap(allocations: TradeLotAllocationRecord[]) {
  const result = new Map<number, TradeLotAllocationInput[]>();
  for (const allocation of allocations) {
    const current = result.get(allocation.sellTradeId) ?? [];
    current.push({ buyTradeId: allocation.buyTradeId, quantity: allocation.quantity });
    result.set(allocation.sellTradeId, current);
  }

  return result;
}

export function getAllocatedLotsForSell(sellTradeId: number, allocations: TradeLotAllocationRecord[]) {
  return allocations.filter((allocation) => allocation.sellTradeId === sellTradeId);
}

export function buildAutoFifoAllocations(sellTrade: TradeRecord, availableLots: AvailableLot[]) {
  let remainingQuantity = sellTrade.quantity;
  const allocations: TradeLotAllocationInput[] = [];

  for (const lot of availableLots) {
    if (remainingQuantity <= 0) {
      break;
    }

    if (lot.availableQuantity <= 0) {
      continue;
    }

    const allocatedQuantity = Math.min(lot.availableQuantity, remainingQuantity);
    allocations.push({ buyTradeId: lot.buyTradeId, quantity: allocatedQuantity });
    remainingQuantity -= allocatedQuantity;
  }

  if (remainingQuantity > 0) {
    throw new InsufficientPositionError(`SELL quantity for ${sellTrade.ticker} exceeds available position`);
  }

  return allocations;
}

export function validateLotAllocations(
  sellTrade: TradeRecord,
  requestedAllocations: TradeLotAllocationInput[] | undefined,
  availableLots: AvailableLot[]
) {
  if (!requestedAllocations || requestedAllocations.length === 0) {
    throw new ValidationError('allocations are required when lotSelectionMethod is SPECIFIC');
  }

  const availableLotMap = new Map(availableLots.map((lot) => [lot.buyTradeId, lot]));
  const aggregated = new Map<number, number>();

  for (const allocation of requestedAllocations) {
    const lot = availableLotMap.get(allocation.buyTradeId);
    if (!lot) {
      throw new ValidationError(`BUY lot ${allocation.buyTradeId} is not available for ${sellTrade.ticker}`);
    }

    if (lot.ticker !== sellTrade.ticker) {
      throw new ValidationError(`BUY lot ${allocation.buyTradeId} ticker does not match SELL ticker`);
    }

    if (lot.tradeDate > sellTrade.tradeDate) {
      throw new ValidationError(`BUY lot ${allocation.buyTradeId} tradeDate cannot be later than SELL tradeDate`);
    }

    aggregated.set(allocation.buyTradeId, (aggregated.get(allocation.buyTradeId) ?? 0) + allocation.quantity);
  }

  let totalQuantity = 0;
  for (const [buyTradeId, quantity] of aggregated.entries()) {
    const lot = availableLotMap.get(buyTradeId);
    if (!lot) {
      continue;
    }

    if (quantity > lot.availableQuantity) {
      throw new InsufficientPositionError(`Allocation for BUY lot ${buyTradeId} exceeds available quantity`);
    }

    totalQuantity += quantity;
  }

  if (Math.abs(totalQuantity - sellTrade.quantity) > 1e-9) {
    throw new ValidationError('Allocation quantity total must equal SELL quantity');
  }

  return [...aggregated.entries()].map(([buyTradeId, quantity]) => ({ buyTradeId, quantity }));
}

export function getOpenLots(
  trades: TradeRecord[],
  allocations: TradeLotAllocationRecord[],
  options?: { ticker?: string; tradeDate?: string }
): AvailableLot[] {
  const tradeMap = new Map(trades.map((trade) => [trade.id, trade]));
  const filteredTrades = sortTrades(trades).filter((trade) => {
    if (options?.ticker && trade.ticker !== options.ticker) {
      return false;
    }

    if (options?.tradeDate && trade.tradeDate > options.tradeDate) {
      return false;
    }

    return trade.type === 'BUY';
  });

  const relevantAllocations = allocations.filter((allocation) => {
    const sellTrade = tradeMap.get(allocation.sellTradeId);
    const buyTrade = tradeMap.get(allocation.buyTradeId);
    if (!sellTrade || !buyTrade) {
      return false;
    }

    if (options?.ticker && buyTrade.ticker !== options.ticker) {
      return false;
    }

    if (options?.tradeDate && sellTrade.tradeDate > options.tradeDate) {
      return false;
    }

    return true;
  });

  const allocatedByBuyTradeId = new Map<number, number>();
  for (const allocation of relevantAllocations) {
    allocatedByBuyTradeId.set(
      allocation.buyTradeId,
      (allocatedByBuyTradeId.get(allocation.buyTradeId) ?? 0) + allocation.quantity
    );
  }

  return filteredTrades
    .map((trade) => {
      const allocatedQuantity = allocatedByBuyTradeId.get(trade.id) ?? 0;
      return {
        buyTradeId: trade.id,
        ticker: trade.ticker,
        tradeDate: trade.tradeDate,
        originalQuantity: trade.quantity,
        allocatedQuantity,
        availableQuantity: trade.quantity - allocatedQuantity,
        price: trade.price,
        fee: trade.fee,
        currency: trade.currency
      } satisfies AvailableLot;
    })
    .filter((lot) => lot.availableQuantity > 0)
    .sort((left, right) => left.tradeDate.localeCompare(right.tradeDate) || left.buyTradeId - right.buyTradeId);
}

export function buildAllocationPlan(
  trades: TradeRecord[],
  persistedAllocations: TradeLotAllocationRecord[],
  overrides: Map<number, TradeLotAllocationInput[] | undefined> = new Map()
) {
  const sortedTrades = sortTrades(trades);
  const specificAllocationMap = getSpecificAllocationMap(persistedAllocations);
  const availableLotsByTicker = new Map<string, AvailableLotState[]>();
  const plannedAllocations: PersistedAllocationDraft[] = [];

  for (const trade of sortedTrades) {
    const tickerLots = availableLotsByTicker.get(trade.ticker) ?? [];

    if (trade.type === 'BUY') {
      tickerLots.push({
        buyTradeId: trade.id,
        ticker: trade.ticker,
        tradeDate: trade.tradeDate,
        originalQuantity: trade.quantity,
        allocatedQuantity: 0,
        availableQuantity: trade.quantity,
        price: trade.price,
        fee: trade.fee,
        currency: trade.currency
      });
      availableLotsByTicker.set(trade.ticker, tickerLots);
      continue;
    }

    const availableLots = tickerLots.filter((lot) => lot.availableQuantity > 0);
    const requestedAllocations = overrides.has(trade.id) ? overrides.get(trade.id) : specificAllocationMap.get(trade.id);
    const normalizedAllocations =
      trade.lotSelectionMethod === 'SPECIFIC'
        ? validateLotAllocations(trade, requestedAllocations, availableLots)
        : buildAutoFifoAllocations(trade, availableLots);

    for (const allocation of normalizedAllocations) {
      const lot = tickerLots.find((item) => item.buyTradeId === allocation.buyTradeId);
      if (!lot) {
        throw new ValidationError(`BUY lot ${allocation.buyTradeId} was not found`);
      }

      if (allocation.quantity > lot.availableQuantity + 1e-9) {
        throw new InsufficientPositionError(`Allocation for BUY lot ${allocation.buyTradeId} exceeds available quantity`);
      }

      lot.allocatedQuantity += allocation.quantity;
      lot.availableQuantity -= allocation.quantity;
      plannedAllocations.push(toDraftAllocation(trade.id, lot, allocation.quantity));
    }

    availableLotsByTicker.set(trade.ticker, tickerLots);
  }

  return plannedAllocations;
}

export function calculateRealizedPnLFromAllocations(
  trades: TradeRecord[],
  allocations: TradeLotAllocationRecord[]
): RealizedPnLResult {
  const tradeMap = new Map(trades.map((trade) => [trade.id, trade]));
  const sellFeePerShareMap = new Map<number, number>();
  for (const trade of trades) {
    if (trade.type === 'SELL') {
      sellFeePerShareMap.set(trade.id, trade.quantity === 0 ? 0 : trade.fee / trade.quantity);
    }
  }

  const matches = allocations
    .map((allocation) => {
      const sellTrade = tradeMap.get(allocation.sellTradeId);
      const buyTrade = tradeMap.get(allocation.buyTradeId);
      if (!sellTrade || !buyTrade) {
        throw new ValidationError('Allocation references missing trade records');
      }

      const averageCost = (allocation.buyPriceSnapshot ?? buyTrade.price) + buyTrade.fee / buyTrade.quantity;
      const proceeds = sellTrade.price * allocation.quantity;
      const costBasis = averageCost * allocation.quantity;
      const fee = (sellFeePerShareMap.get(sellTrade.id) ?? 0) * allocation.quantity;
      const realizedPnL = proceeds - costBasis - fee;

      return {
        sellTradeId: sellTrade.id,
        buyTradeId: buyTrade.id,
        sellDate: sellTrade.tradeDate,
        buyTradeDate: allocation.buyTradeDateSnapshot ?? buyTrade.tradeDate,
        ticker: sellTrade.ticker,
        allocatedQuantity: allocation.quantity,
        sellPrice: sellTrade.price,
        averageCost,
        proceeds,
        costBasis,
        fee,
        realizedPnL,
        returnRate: costBasis === 0 ? 0 : realizedPnL / costBasis,
        currency: sellTrade.currency,
        buyPriceSnapshot: allocation.buyPriceSnapshot,
        buyTradeDateSnapshot: allocation.buyTradeDateSnapshot
      } satisfies RealizedMatch;
    })
    .sort((left, right) => left.sellDate.localeCompare(right.sellDate) || left.sellTradeId - right.sellTradeId || left.buyTradeId - right.buyTradeId);

  return {
    matches,
    totalRealizedPnL: matches.reduce((sum, match) => sum + match.realizedPnL, 0)
  };
}

export function calculateOpenPositionsFromLots(
  trades: TradeRecord[],
  allocations: TradeLotAllocationRecord[]
): PositionSummary[] {
  const openLots = getOpenLots(trades, allocations);
  const grouped = new Map<string, AvailableLot[]>();

  for (const lot of openLots) {
    const current = grouped.get(lot.ticker) ?? [];
    current.push(lot);
    grouped.set(lot.ticker, current);
  }

  return [...grouped.entries()]
    .map(([ticker, lots]) => {
      const quantity = lots.reduce((sum, lot) => sum + lot.availableQuantity, 0);
      const totalCost = lots.reduce(
        (sum, lot) => sum + (lot.price + lot.fee / lot.originalQuantity) * lot.availableQuantity,
        0
      );

      return {
        ticker,
        quantity,
        averageCost: quantity === 0 ? 0 : totalCost / quantity,
        totalCost,
        currency: lots[0]?.currency ?? 'USD',
        lots
      } satisfies PositionSummary;
    })
    .filter((position) => position.quantity > 0)
    .sort((left, right) => left.ticker.localeCompare(right.ticker));
}

export async function calculateUnrealizedPnL(
  trades: TradeRecord[],
  allocations: TradeLotAllocationRecord[],
  getPrice: PriceProvider
): Promise<UnrealizedSummary[]> {
  const positions = calculateOpenPositionsFromLots(trades, allocations);
  const result = await Promise.all(
    positions.map(async (position) => {
      const marketPrice = await getPrice(position.ticker);
      const marketValue = marketPrice == null ? null : marketPrice * position.quantity;
      const unrealizedPnL = marketValue == null ? null : marketValue - position.totalCost;
      return {
        ticker: position.ticker,
        quantity: position.quantity,
        marketPrice,
        averageCost: position.averageCost,
        marketValue,
        costBasis: position.totalCost,
        unrealizedPnL,
        unrealizedReturnRate: unrealizedPnL == null ? null : (position.totalCost === 0 ? 0 : unrealizedPnL / position.totalCost),
        currency: position.currency
      } satisfies UnrealizedSummary;
    })
  );

  return result.sort((left, right) => left.ticker.localeCompare(right.ticker));
}

export function buildCumulativePnLSeries(matches: RealizedMatch[]): TimeSeriesPoint[] {
  let runningPnL = 0;
  return matches.map((match) => {
    runningPnL += match.realizedPnL;
    return {
      label: match.sellDate,
      value: runningPnL
    } satisfies TimeSeriesPoint;
  });
}

export function calculateYearlySummary(
  trades: TradeRecord[],
  allocations: TradeLotAllocationRecord[],
  unrealizedSummaries: UnrealizedSummary[] = []
): YearlySummary[] {
  const realized = calculateRealizedPnLFromAllocations(trades, allocations);
  const yearlyMap = new Map<string, YearlySummary>();

  for (const trade of trades) {
    const year = dayjs(trade.tradeDate).format('YYYY');
    const current = yearlyMap.get(year) ?? {
      year,
      realizedPnL: 0,
      unrealizedPnL: 0,
      tradeCount: 0,
      grossBuyAmount: 0,
      grossSellAmount: 0,
      returnRate: 0
    };

    current.tradeCount += 1;
    if (trade.type === 'BUY') {
      current.grossBuyAmount += trade.quantity * trade.price;
    } else {
      current.grossSellAmount += trade.quantity * trade.price;
    }
    yearlyMap.set(year, current);
  }

  for (const match of realized.matches) {
    const year = dayjs(match.sellDate).format('YYYY');
    const current = yearlyMap.get(year);
    if (current) {
      current.realizedPnL += match.realizedPnL;
    }
  }

  const currentYear = dayjs().format('YYYY');
  const currentYearSummary = yearlyMap.get(currentYear);
  if (currentYearSummary) {
    const hasMissingUnrealized = unrealizedSummaries.some((item) => item.unrealizedPnL == null);
    currentYearSummary.unrealizedPnL = hasMissingUnrealized
      ? null
      : unrealizedSummaries.reduce((sum, item) => sum + (item.unrealizedPnL ?? 0), 0);
  }

  return [...yearlyMap.values()]
    .map((item) => {
      const denominator = item.grossBuyAmount === 0 ? item.grossSellAmount : item.grossBuyAmount;
      return {
        ...item,
        returnRate:
          item.unrealizedPnL == null
            ? null
            : denominator === 0
              ? 0
              : (item.realizedPnL + item.unrealizedPnL) / denominator
      };
    })
    .sort((left, right) => left.year.localeCompare(right.year));
}

export function calculatePerformanceMetrics(
  trades: TradeRecord[],
  allocations: TradeLotAllocationRecord[]
): PerformanceMetrics {
  const realized = calculateRealizedPnLFromAllocations(trades, allocations);
  const sellTotals = new Map<number, number>();

  for (const match of realized.matches) {
    sellTotals.set(match.sellTradeId, (sellTotals.get(match.sellTradeId) ?? 0) + match.realizedPnL);
  }

  const tradePnLs = [...sellTotals.values()];
  const wins = tradePnLs.filter((value) => value > 0);
  const losses = tradePnLs.filter((value) => value < 0);
  const totalWins = wins.reduce((sum, value) => sum + value, 0);
  const totalLossMagnitude = losses.reduce((sum, value) => sum + Math.abs(value), 0);

  return {
    winRate: tradePnLs.length === 0 ? 0 : wins.length / tradePnLs.length,
    totalClosedTrades: tradePnLs.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    averageWin: wins.length === 0 ? 0 : totalWins / wins.length,
    averageLoss: losses.length === 0 ? 0 : losses.reduce((sum, value) => sum + value, 0) / losses.length,
    maxWin: wins.length === 0 ? 0 : Math.max(...wins),
    maxLoss: losses.length === 0 ? 0 : Math.min(...losses),
    profitFactor: totalLossMagnitude === 0 ? (totalWins > 0 ? Number.POSITIVE_INFINITY : 0) : totalWins / totalLossMagnitude,
    cumulativePnLCurve: buildCumulativePnLSeries(realized.matches)
  };
}
