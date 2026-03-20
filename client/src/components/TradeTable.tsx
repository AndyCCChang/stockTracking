import type { Trade } from '../types/trade';
import { currency, number } from '../lib/format';

export function TradeTable({ trades, onEdit, onDelete }: { trades: Trade[]; onEdit: (trade: Trade) => void; onDelete: (id: number) => Promise<void> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              {['Date', 'Symbol', 'Side', 'Qty', 'Price', 'Fees', 'Notes', 'Actions'].map((heading) => <th key={heading} className="px-4 py-3 text-left">{heading}</th>)}
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id} className="border-t border-slate-200 dark:border-slate-800">
                <td className="px-4 py-3">{trade.tradeDate}</td>
                <td className="px-4 py-3 font-medium">{trade.symbol}</td>
                <td className="px-4 py-3">{trade.side}</td>
                <td className="px-4 py-3">{number(trade.quantity)}</td>
                <td className="px-4 py-3">{currency(trade.price)}</td>
                <td className="px-4 py-3">{currency(trade.fees)}</td>
                <td className="px-4 py-3">{trade.notes}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button className="text-emerald-500" onClick={() => onEdit(trade)}>Edit</button>
                    <button className="text-rose-500" onClick={() => onDelete(trade.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
