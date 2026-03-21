import axios from 'axios';

export type HealthResponse = {
  status: 'ok';
  service: string;
  database: string;
  timestamp: string;
};

const api = axios.create({
  baseURL: '/api',
  timeout: 5000
});

export async function fetchHealth() {
  const { data } = await api.get<HealthResponse>('/health');
  return data;
}
