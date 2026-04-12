import apiClient from './client';

export interface ApiKeyPayload {
    exchange: string;
    name: string;
    api_key: string;
    secret_key: string;
    passphrase?: string;
}

export interface ExchangeBalanceResult {
    id: number;
    name: string;
    exchange: string;
    balances: Record<string, number>;
    total_usdt: number;
    error?: string;
}

export interface SyncBalanceResult {
    success: boolean;
    new_balance: number;
    message: string;
}

export const fetchApiKeys = async () => {
    const response = await apiClient.get('/users/api-keys');
    return response.data;
};

export const saveApiKey = async (data: ApiKeyPayload) => {
    const response = await apiClient.post('/users/api-keys', data);
    return response.data;
};

export const deleteApiKey = async (keyId: number) => {
    const response = await apiClient.delete(`/users/api-keys/${keyId}`);
    return response.data;
};

/**
 * সব connected exchange থেকে real-time balance fetch করো।
 * প্রতিটি exchange-এর per-coin breakdown সহ total USDT দেখায়।
 */
export const fetchExchangeBalance = async (): Promise<ExchangeBalanceResult[]> => {
    const response = await apiClient.get<ExchangeBalanceResult[]>('/users/exchange-balance');
    return response.data;
};

/**
 * সব exchange balance sum করে user.balance DB-তে sync করো।
 * Dashboard Total Equity এই value দেখাবে।
 */
export const syncExchangeBalance = async (): Promise<SyncBalanceResult> => {
    const response = await apiClient.post<SyncBalanceResult>('/users/sync-balance');
    return response.data;
};
