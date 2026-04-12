import apiClient from './client';

export interface BackendTokenUnlockEvent {
    id: number;
    symbol: string;
    token_name: string | null;
    unlock_date: string;
    amount: number;
    amount_usd: number;
    circulating_supply_pct: number | null;
    impact_score: number | null;
    ai_summary: string | null;
    vesting_schedule: Array<{ date: string; unlockedPercentage?: number; amount?: number }> | null;
    allocations: Array<{ name: string; value?: number; pct?: number }> | null;
    is_verified: boolean;
}

export const unlockService = {
    getAll: async (): Promise<BackendTokenUnlockEvent[]> => {
        const response = await apiClient.get<BackendTokenUnlockEvent[]>('/token-unlocks/');
        return response.data;
    },

    sync: async (symbol: string): Promise<BackendTokenUnlockEvent> => {
        const response = await apiClient.post<BackendTokenUnlockEvent>(`/token-unlocks/sync/${symbol}`);
        return response.data;
    },

    getAnalysis: async (id: number): Promise<BackendTokenUnlockEvent> => {
        const response = await apiClient.get<BackendTokenUnlockEvent>(`/token-unlocks/${id}/analysis`);
        return response.data;
    }
};
