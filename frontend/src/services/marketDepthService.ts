import apiClient from './client';

export const marketDepthService = {
    getOHLCV: async (symbol: string, exchange: string, timeframe: string, limit: number = 200) => {
        const response = await apiClient.get('/market-depth/ohlcv', {
            params: {
                symbol,
                exchange,
                timeframe,
                limit
            }
        });
        return response.data;
    },
    getRawOrderBook: async (symbol: string, exchange: string, limit: number = 100) => {
        const response = await apiClient.get('/market-depth/book', {
            params: {
                symbol,
                exchange,
                limit
            }
        });
        return response.data;
    }
};
