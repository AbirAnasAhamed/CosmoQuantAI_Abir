import apiClient from './client';

export const marketDataService = {
    // ১. সব এক্সচেঞ্জের লিস্ট আনা
    getAllExchanges: async (): Promise<string[]> => {
        const response = await apiClient.get<string[]>('/market-data/exchanges');
        return response.data;
    },

    // ২. নির্দিষ্ট এক্সচেঞ্জের সব পেয়ার আনা
    getExchangePairs: async (exchangeId: string): Promise<string[]> => {
        const response = await apiClient.get<string[]>(`/market-data/pairs/${exchangeId}`);
        return response.data;
    },

    // ৩. নির্দিষ্ট এক্সচেঞ্জের টাইমফ্রেম আনা
    getExchangeTimeframes: async (exchangeId: string): Promise<string[]> => {
        const response = await apiClient.get<string[]>(`/market-data/timeframes/${exchangeId}`);
        return response.data;
    },

    // 4. Get Exchange Credentials Info
    getExchangeCredentials: async (): Promise<Record<string, { name: string, fields: string[] }>> => {
        const response = await apiClient.get<Record<string, { name: string, fields: string[] }>>('/market-data/exchange-credentials');
        return response.data;
    }
};
