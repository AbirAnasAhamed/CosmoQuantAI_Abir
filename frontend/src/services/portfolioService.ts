import apiClient from './client';
import { Asset } from '@/types';

export interface ApiKeyData {
    id?: number;
    name: string;
    exchange: string;
    api_key: string;
    secret_key: string;
    passphrase?: string;
    is_enabled?: boolean;
}

export const portfolioService = {
    async fetchBalances(): Promise<{ assets: Asset[], total_portfolio_value: number }> {
        const response = await apiClient.get('/portfolio/balances');
        return response.data;
    },

    async fetchApiKeys(): Promise<ApiKeyData[]> {
        const response = await apiClient.get('/users/api-keys');
        return response.data;
    },

    async addApiKey(data: ApiKeyData): Promise<ApiKeyData> {
        const response = await apiClient.post('/users/api-keys', data);
        return response.data;
    },

    async deleteApiKey(id: number): Promise<void> {
        await apiClient.delete(`/users/api-keys/${id}`);
    },

    async fetchTradingFee(keyId: string | number, symbol: string): Promise<{ maker: number, taker: number }> {
        const response = await apiClient.get(`/portfolio/fee/${keyId}`, {
            params: { symbol }
        });
        return response.data;
    }
};
