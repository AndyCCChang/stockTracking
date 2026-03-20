import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import { Layout } from './components/Layout';
import { TradeForm } from './components/TradeForm';
import { TradeTable } from './components/TradeTable';
import { tradeApi } from './lib/api';
import { DashboardPage } from './pages/DashboardPage';
import { MetricsPage } from './pages/MetricsPage';
import { PositionsPage } from './pages/PositionsPage';
import { RealizedPage } from './pages/RealizedPage';
import { YearlyPerformancePage } from './pages/YearlyPerformancePage';
import type { PerformanceMetrics, PositionSummary, RealizedLot, Trade, TradeInput } from './types/trade';

function JournalPage({
  trades,
  selectedTrade,
  onSelectTrade,
  onSubmit,
  onDelete,
  onImport,
  onExport
}: {
  trades: Trade[];
  selectedTrade: Trade | null;
  onSelectTrade: (trade: Trade | null) => void;
  onSubmit: (trade: TradeInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onImport: (file: File) => Promise<void>;
  onExport: () => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr]">
        <TradeForm selectedTrade={selectedTrade} onSubmit={onSubmit} onCancel={() => onSelectTrade(null)} />
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-lg font-semibold">CSV Import / Export</h2>
          <div className="flex flex-wrap gap-3">
            <label className="cursor-pointer rounded-md border border-slate-300 px-4 py-2 dark:border-slate-700">
              Import CSV
              <input className="hidden" type="file" accept=".csv" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void onImport(file);
                  event.currentTarget.value = '';
                }
              }} />
            </label>
            <button className="rounded-md bg-sky-500 px-4 py-2 font-medium text-white" onClick={() => void onExport()}>
              Export CSV
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Expected columns: symbol, tradeDate, side, quantity, price, fees, notes.</p>
        </div>
      </div>
      <TradeTable trades={trades} onEdit={onSelectTrade} onDelete={onDelete} />
    </div>
  );
}

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<PositionSummary[]>([]);
  const [realized, setRealized] = useState<RealizedLot[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [yearly, setYearly] = useState<Array<{ year: string; realizedPnL: number }>>([]);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const refresh = async () => {
    try {
      const [tradesData, positionsData, realizedData, metricsData, yearlyData] = await Promise.all([
        tradeApi.list(),
        tradeApi.positions(),
        tradeApi.realized(),
        tradeApi.metrics(),
        tradeApi.yearly()
      ]);
      setTrades(tradesData);
      setPositions(positionsData);
      setRealized(realizedData);
      setMetrics(metricsData);
      setYearly(yearlyData);
      setError(null);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message ?? err.message : 'Unknown error');
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const journalProps = useMemo(() => ({
    trades,
    selectedTrade,
    onSelectTrade: setSelectedTrade,
    onSubmit: async (trade: TradeInput) => {
      try {
        if (selectedTrade) {
          await tradeApi.update(selectedTrade.id, trade);
        } else {
          await tradeApi.create(trade);
        }
        setSelectedTrade(null);
        await refresh();
      } catch (err) {
        setError(axios.isAxiosError(err) ? err.response?.data?.message ?? err.message : 'Unknown error');
      }
    },
    onDelete: async (id: number) => {
      try {
        await tradeApi.remove(id);
        if (selectedTrade?.id === id) {
          setSelectedTrade(null);
        }
        await refresh();
      } catch (err) {
        setError(axios.isAxiosError(err) ? err.response?.data?.message ?? err.message : 'Unknown error');
      }
    },
    onImport: async (file: File) => {
      const text = await file.text();
      const rows = text.split(/\r?\n/).filter(Boolean);
      const [header, ...dataRows] = rows;
      const columns = header.split(',').map((item) => item.trim());
      const tradesToImport = dataRows.map((row) => {
        const values = row.split(',');
        const payload = Object.fromEntries(columns.map((column, index) => [column, values[index] ?? '']));
        return {
          symbol: payload.symbol,
          tradeDate: payload.tradeDate,
          side: payload.side as TradeInput['side'],
          quantity: Number(payload.quantity),
          price: Number(payload.price),
          fees: Number(payload.fees ?? 0),
          notes: payload.notes ?? ''
        };
      });
      try {
        await tradeApi.importTrades(tradesToImport);
        await refresh();
      } catch (err) {
        setError(axios.isAxiosError(err) ? err.response?.data?.message ?? err.message : 'Unknown error');
      }
    },
    onExport: async () => {
      const csv = await tradeApi.exportCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'trades.csv';
      link.click();
      URL.revokeObjectURL(url);
    }
  }), [selectedTrade, trades]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout darkMode={darkMode} onToggleDarkMode={() => setDarkMode((value) => !value)} />}>
          <Route path="/" element={<div className="space-y-6">
            {error ? <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-rose-600 dark:border-rose-900 dark:bg-rose-950/40">{error}</div> : null}
            <DashboardPage trades={trades} metrics={metrics} positions={positions} />
            <JournalPage {...journalProps} />
          </div>} />
          <Route path="/positions" element={<PositionsPage positions={positions} />} />
          <Route path="/realized" element={<RealizedPage realized={realized} />} />
          <Route path="/yearly" element={<YearlyPerformancePage data={yearly} />} />
          <Route path="/metrics" element={<MetricsPage metrics={metrics} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
