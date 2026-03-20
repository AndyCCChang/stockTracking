import axios from 'axios';
import type { PerformanceMetrics, PositionSummary, RealizedLot, Trade, TradeInput } from '../types/trade';

const api = axios.create({ baseURL: '/api' });

export const tradeApi = {
  list: async () => (await api.get<Trade[]>('/trades')).data,
  create: async (payload: TradeInput) => (await api.post<Trade>('/trades', payload)).data,
  update: async (id: number, payload: TradeInput) => (await api.put<Trade>(`/trades/${id}`, payload)).data,
  remove: async (id: number) => api.delete(`/trades/${id}`),
  exportCsv: async () => (await api.get<string>('/trades/export', { responseType: 'text' })).data,
  importTrades: async (trades: TradeInput[]) => (await api.post<Trade[]>('/trades/import', { trades })).data,
  positions: async () => (await api.get<PositionSummary[]>('/analytics/positions')).data,
  realized: async () => (await api.get<RealizedLot[]>('/analytics/realized')).data,
  metrics: async () => (await api.get<PerformanceMetrics>('/analytics/metrics')).data,
  yearly: async () => (await api.get<Array<{ year: string; realizedPnL: number }>>('/analytics/yearly')).data
};
