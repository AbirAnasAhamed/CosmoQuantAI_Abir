import api from './api';

export interface OrderPayload {
  symbol: string;
  side: 'Buy' | 'Sell';
  type: 'Market' | 'Limit';
  amount: number;
  price?: number;
  exchange_id: string;
  api_key_id?: number | null;
  params?: {
    leverage?: number;
    marginMode?: 'cross' | 'isolated';
    reduceOnly?: boolean;
  };
  client_timestamp?: number;
}

export interface ApiKey {
  id: number;
  exchange: string;
  api_key: string;
  name?: string;
  key_name?: string;
  label?: string; // Sometimes the backend returns name/label, we fallback to formatting if absent
}

export interface FastBalanceResponse {
  base: string;
  base_free: number;
  quote: string;
  quote_free: number;
  is_futures: boolean;
}

export interface FastPositionResponse {
  amount: number;
  side: 'long' | 'short' | 'none';
}

export const manualTradeService = {
  getApiKeys: async () => {
    const response = await api.get('/users/api-keys');
    return response.data as ApiKey[];
  },

  getFastBalance: async (apiKeyId: number, symbol: string) => {
    const response = await api.get(`/trading/api-key-balance/${apiKeyId}?symbol=${symbol}`);
    return response.data as FastBalanceResponse;
  },

  getActivePosition: async (apiKeyId: number, symbol: string) => {
    const response = await api.get(`/trading/api-key-position/${apiKeyId}?symbol=${symbol}`);
    return response.data as FastPositionResponse;
  },

  placeOrder: async (order: OrderPayload) => {
    // lowercase the side to match typical backend expectations ('buy' or 'sell')
    const formattedOrder = {
      ...order,
      side: order.side.toLowerCase(),
      type: order.type.toLowerCase(),
    };
    
    const response = await api.post('/trading/order', formattedOrder);
    return response.data;
  }
};
