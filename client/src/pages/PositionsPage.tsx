import { currency, number } from '../lib/format';
import type { PositionSummary } from '../types/trade';

export function PositionsPage({ positions }: { positions: PositionSummary[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/50">
          <tr>{['Symbol', 'Qty', 'Avg Cost', 'Market Price', 'Market Value', 'Unrealized P&L'].map((heading) => <th key={heading} className="px-4 py-3 text-left">{heading}</th>)}</tr>
        </thead>
        <tbody>
          {positions.map((position) => (
            <tr key={position.symbol} className="border-t border-slate-200 dark:border-slate-800">
              <td className="px-4 py-3 font-medium">{position.symbol}</td>
              <td className="px-4 py-3">{number(position.quantity)}</td>
              <td className="px-4 py-3">{currency(position.averageCost)}</td>
              <td className="px-4 py-3">{currency(position.marketPrice)}</td>
              <td className="px-4 py-3">{currency(position.marketValue)}</td>
              <td className={`px-4 py-3 ${position.unrealizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{currency(position.unrealizedPnL)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
