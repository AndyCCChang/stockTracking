import { useEffect, useMemo, useState } from 'react';
import type { Trade, TradeInput } from '../types/trade';
import { validateTradeInput } from '../lib/validation';

const defaultTrade: TradeInput = {
  symbol: '',
  tradeDate: new Date().toISOString().slice(0, 10),
  side: 'BUY',
  quantity: 0,
  price: 0,
  fees: 0,
  notes: ''
};

export function TradeForm({ selectedTrade, onSubmit, onCancel }: {
  selectedTrade?: Trade | null;
  onSubmit: (trade: TradeInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<TradeInput>(selectedTrade ? { ...selectedTrade } : defaultTrade);
  const [error, setError] = useState<string | null>(null);
  const isEditing = useMemo(() => Boolean(selectedTrade), [selectedTrade]);

  useEffect(() => {
    setForm(selectedTrade ? { ...selectedTrade } : defaultTrade);
    setError(null);
  }, [selectedTrade]);

  return (
    <form
      className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const next = { ...form, symbol: form.symbol.trim().toUpperCase() };
        const validationError = validateTradeInput(next);
        if (validationError) {
          setError(validationError);
          return;
        }
        setError(null);
        await onSubmit(next);
        if (!isEditing) {
          setForm(defaultTrade);
        }
      }}
    >
      <input className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" placeholder="Symbol" value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value })} />
      <input className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" type="date" value={form.tradeDate} onChange={(event) => setForm({ ...form, tradeDate: event.target.value })} />
      <select className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" value={form.side} onChange={(event) => setForm({ ...form, side: event.target.value as TradeInput['side'] })}>
        <option value="BUY">BUY</option>
        <option value="SELL">SELL</option>
      </select>
      <input className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" type="number" min="0" step="0.0001" placeholder="Quantity" value={form.quantity || ''} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} />
      <input className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" type="number" min="0" step="0.0001" placeholder="Price" value={form.price || ''} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} />
      <input className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" type="number" min="0" step="0.01" placeholder="Fees" value={form.fees || ''} onChange={(event) => setForm({ ...form, fees: Number(event.target.value) })} />
      <textarea className="md:col-span-2 rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      {error ? <p className="md:col-span-2 text-sm text-rose-500">{error}</p> : null}
      <div className="md:col-span-2 flex gap-3">
        <button className="rounded-md bg-emerald-500 px-4 py-2 font-medium text-white" type="submit">{isEditing ? 'Update Trade' : 'Add Trade'}</button>
        {isEditing ? <button className="rounded-md border border-slate-300 px-4 py-2 dark:border-slate-700" type="button" onClick={onCancel}>Cancel</button> : null}
      </div>
    </form>
  );
}
