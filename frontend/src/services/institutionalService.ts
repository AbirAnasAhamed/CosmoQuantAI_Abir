import apiClient from './api';
import { InstitutionalFund, PortfolioStats, TopMover } from '../types/institutional';

export const institutionalService = {
    getGurus: async () => {
        const response = await apiClient.get<InstitutionalFund[]>('/institutional/');
        return response.data;
    },

    getFundDetails: async (fundId: number) => {
        const response = await apiClient.get<InstitutionalFund>(`/institutional/${fundId}`);
        return response.data;
    },

    getFundStats: async (fundId: number) => {
        const response = await apiClient.get<PortfolioStats>(`/institutional/${fundId}/stats`);
        return response.data;
    },

    getTopMovers: async () => {
        const response = await apiClient.get<TopMover[]>('/institutional/movers');
        return response.data;
    },

    syncGurus: async () => {
        const response = await apiClient.post<{ message: string }>('/institutional/sync');
        return response.data;
    }
};
