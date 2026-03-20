import type { PerformanceMetrics, PositionSummary, RealizedLot, Trade } from '../types.js';
import { priceService } from '../services/priceService.js';

interface OpenLot {
  quantity: number;
  unitCost: number;
}

export function calculateRealizedLots(trades: Trade[]): RealizedLot[] {
  const lotsBySymbol = new Map<string, OpenLot[]>();
  const realized: RealizedLot[] = [];

  const ordered = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id - b.id);
  for (const trade of ordered) {
    const symbolLots = lotsBySymbol.get(trade.symbol) ?? [];
    if (trade.side === 'BUY') {
      symbolLots.push({
        quantity: trade.quantity,
        unitCost: (trade.price * trade.quantity + trade.fees) / trade.quantity
      });
      lotsBySymbol.set(trade.symbol, symbolLots);
      continue;
    }

    let remaining = trade.quantity;
    const sellUnitProceeds = (trade.price * trade.quantity - trade.fees) / trade.quantity;
    while (remaining > 0) {
      const lot = symbolLots[0];
      if (!lot) {
        throw new Error(`Cannot sell more shares than current holdings for ${trade.symbol}.`);
      }
      const matchedQuantity = Math.min(remaining, lot.quantity);
      const costBasis = matchedQuantity * lot.unitCost;
      const proceeds = matchedQuantity * sellUnitProceeds;
      realized.push({
        symbol: trade.symbol,
        sellTradeId: trade.id,
        tradeDate: trade.tradeDate,
        quantity: matchedQuantity,
        proceeds,
        costBasis,
        fees: 0,
        realizedPnL: proceeds - costBasis
      });
      lot.quantity -= matchedQuantity;
      remaining -= matchedQuantity;
      if (lot.quantity === 0) {
        symbolLots.shift();
      }
    }
  }

  return realized;
}

export function validateNoOversell(trades: Trade[]): void {
  const balances = new Map<string, number>();
  const ordered = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id - b.id);
  for (const trade of ordered) {
    const current = balances.get(trade.symbol) ?? 0;
    const next = trade.side === 'BUY' ? current + trade.quantity : current - trade.quantity;
    if (next < -1e-8) {
      throw new Error(`Cannot sell more shares than current holdings for ${trade.symbol}.`);
    }
    balances.set(trade.symbol, next);
  }
}

export async function calculatePositions(trades: Trade[]): Promise<PositionSummary[]> {
  const grouped = new Map<string, Trade[]>();
  for (const trade of trades) {
    const current = grouped.get(trade.symbol) ?? [];
    current.push(trade);
    grouped.set(trade.symbol, current);
  }

  const positions: PositionSummary[] = [];
  for (const [symbol, symbolTrades] of grouped.entries()) {
    let quantity = 0;
    let cost = 0;
    for (const trade of symbolTrades) {
      if (trade.side === 'BUY') {
        quantity += trade.quantity;
        cost += trade.quantity * trade.price + trade.fees;
      } else if (quantity > 0) {
        const avgCost = cost / quantity;
        quantity -= trade.quantity;
        cost -= avgCost * trade.quantity;
      }
    }

    if (quantity <= 0) continue;
    const marketPrice = await priceService.getLatestPrice(symbol);
    const marketValue = quantity * marketPrice;
    positions.push({
      symbol,
      quantity,
      averageCost: cost / quantity,
      marketPrice,
      marketValue,
      unrealizedPnL: marketValue - cost
    });
  }

  return positions.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export async function calculateMetrics(trades: Trade[]): Promise<PerformanceMetrics> {
  const realizedLots = calculateRealizedLots(trades);
  const positions = await calculatePositions(trades);
  const wins = realizedLots.filter((lot) => lot.realizedPnL > 0);
  const losses = realizedLots.filter((lot) => lot.realizedPnL < 0);
  const grossProfit = wins.reduce((sum, lot) => sum + lot.realizedPnL, 0);
  const grossLoss = Math.abs(losses.reduce((sum, lot) => sum + lot.realizedPnL, 0));

  return {
    totalRealizedPnL: realizedLots.reduce((sum, lot) => sum + lot.realizedPnL, 0),
    totalUnrealizedPnL: positions.reduce((sum, position) => sum + position.unrealizedPnL, 0),
    winRate: realizedLots.length ? wins.length / realizedLots.length : 0,
    profitFactor: grossLoss === 0 ? grossProfit : grossProfit / grossLoss,
    averageWin: wins.length ? grossProfit / wins.length : 0,
    averageLoss: losses.length ? losses.reduce((sum, lot) => sum + lot.realizedPnL, 0) / losses.length : 0
  };
}
