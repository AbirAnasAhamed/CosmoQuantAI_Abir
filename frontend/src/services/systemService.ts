import client from './client';

export interface SystemHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: {
        database: string;
        redis: string;
        celery_worker: string;
    };
    timestamp: string;
}

export const systemService = {
    getKillSwitchStatus: async () => {
        const response = await client.get('/system/kill-switch');
        return response.data;
    },

    toggleKillSwitch: async (active: boolean) => {
        const response = await client.post('/system/kill-switch', { active });
        return response.data;
    },

    getSystemHealth: async (): Promise<SystemHealth> => {
        const response = await client.get('/system/health');
        return response.data;
    }
};
