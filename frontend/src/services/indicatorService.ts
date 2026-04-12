import apiClient from './client';
import { SavedIndicator } from '@/types';

export const indicatorService = {
    getAll: async (): Promise<SavedIndicator[]> => {
        const response = await apiClient.get<SavedIndicator[]>('/indicators/');
        return response.data;
    },

    create: async (data: SavedIndicator): Promise<SavedIndicator> => {
        const response = await apiClient.post<SavedIndicator>('/indicators/', data);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await apiClient.delete(`/indicators/${id}`);
    },

    getTemplates: async (): Promise<SavedIndicator[]> => {
        const response = await apiClient.get<SavedIndicator[]>('/indicators/templates');
        return response.data;
    }
};
