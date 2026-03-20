import { currency, number } from '../lib/format';
import type { RealizedLot } from '../types/trade';

export function RealizedPage({ realized }: { realized: RealizedLot[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/50">
          <tr>{['Date', 'Symbol', 'Qty', 'Proceeds', 'Cost Basis', 'Realized P&L'].map((heading) => <th key={heading} className="px-4 py-3 text-left">{heading}</th>)}</tr>
        </thead>
        <tbody>
          {realized.map((row) => (
            <tr key={`${row.sellTradeId}-${row.quantity}-${row.costBasis}`} className="border-t border-slate-200 dark:border-slate-800">
              <td className="px-4 py-3">{row.tradeDate}</td>
              <td className="px-4 py-3 font-medium">{row.symbol}</td>
              <td className="px-4 py-3">{number(row.quantity)}</td>
              <td className="px-4 py-3">{currency(row.proceeds)}</td>
              <td className="px-4 py-3">{currency(row.costBasis)}</td>
              <td className={`px-4 py-3 ${row.realizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{currency(row.realizedPnL)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
