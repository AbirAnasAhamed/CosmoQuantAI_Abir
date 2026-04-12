import api from '@/services/api';
import { EducationResource } from '../types';

export const educationService = {
    getAllResources: async (level?: string, type?: string) => {
        const params: any = {};
        if (level) params.level = level;
        if (type) params.type = type;

        // Using axios params serialization
        const response = await api.get<EducationResource[]>('/education/', { params });
        return response.data;
    },

    refreshNews: async () => {
        const response = await api.post('/education/refresh-news');
        return response.data;
    },

    initializeAcademy: async () => {
        const response = await api.post('/education/init');
        return response.data;
    }
};
