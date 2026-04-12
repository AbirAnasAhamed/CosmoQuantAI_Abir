import apiClient from './client'; // আপনার client.ts এর এক্সপোর্ট নাম (default export হলে apiClient)
import { ActiveBot } from '@/types';

export const botService = {
    // ✅ ফিক্স: '/bots/' এর বদলে '/v1/bots/' ব্যবহার করা হয়েছে
    getAllBots: async (skip: number = 0, limit: number = 100): Promise<ActiveBot[]> => {
        const response = await apiClient.get('/bots/', {
            params: { skip, limit }
        });
        return response.data;
    },

    getBotStats: async (): Promise<{ total_pnl: number; average_win_rate: number; active_bots: number; total_bots: number }> => {
        const response = await apiClient.get('/bots/stats');
        return response.data;
    },

    createBot: async (botData: any): Promise<ActiveBot> => {
        const response = await apiClient.post('/bots/', botData);
        return response.data;
    },

    controlBot: async (botId: string | number, action: 'start' | 'stop' | 'pause'): Promise<ActiveBot> => {
        const response = await apiClient.post(`/bots/${botId}/action`, null, {
            params: { action }
        });
        return response.data;
    },

    updateBot: async (id: number | string, data: any): Promise<ActiveBot> => {
        const response = await apiClient.put(`/bots/${id}`, data);
        return response.data;
    },

    deleteBot: async (botId: string | number): Promise<void> => {
        await apiClient.delete(`/bots/${botId}`);
    },

    emergencySell: async (botId: string | number, type: 'market' | 'limit'): Promise<any> => {
        const response = await apiClient.post(`/bots/${botId}/emergency_sell`, { sell_type: type });
        return response.data;
    }
};
