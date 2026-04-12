import apiClient from './client';

export interface LeadLagBot {
    id: number;
    user_id: number;
    name?: string;
    leader_pair: string;
    target_pair: string;
    exchange: string;
    api_key_id?: number | null;
    timeframe: string;
    trade_size: number;
    take_profit_pct: number;
    stop_loss_pct: number;
    is_paper_trading: boolean;
    paper_balance: number;
    is_active: boolean;
    total_profit: number;
    created_at: string;
    updated_at?: string;
}

export interface LeadLagTradeLog {
    id: number;
    bot_id: number;
    trigger_reason: string;
    executed_pair: string;
    side: string;
    price: number;
    quantity: number;
    pnl?: number;
    status: string;
    order_id?: string;
    created_at: string;
}

export const leadLagService = {
    // 1. Get List of Bots
    getBots: async (): Promise<LeadLagBot[]> => {
        const response = await apiClient.get<LeadLagBot[]>('/lead-lag-bot/');
        return response.data;
    },

    // 2. Get Single Bot details
    getBot: async (id: number): Promise<LeadLagBot> => {
        const response = await apiClient.get<LeadLagBot>(`/lead-lag-bot/${id}`);
        return response.data;
    },

    // 3. Create a Bot
    createBot: async (data: Partial<LeadLagBot>): Promise<LeadLagBot> => {
        const response = await apiClient.post<LeadLagBot>('/lead-lag-bot/', data);
        return response.data;
    },

    // 4. Update an existing Bot
    updateBot: async (id: number, data: Partial<LeadLagBot>): Promise<LeadLagBot> => {
        const response = await apiClient.put<LeadLagBot>(`/lead-lag-bot/${id}`, data);
        return response.data;
    },

    // 5. Start the Bot
    startBot: async (id: number): Promise<{ status: string, message: string }> => {
        const response = await apiClient.post<{ status: string, message: string }>(`/lead-lag-bot/${id}/start`);
        return response.data;
    },

    // 6. Stop the Bot
    stopBot: async (id: number): Promise<{ status: string, message: string }> => {
        const response = await apiClient.post<{ status: string, message: string }>(`/lead-lag-bot/${id}/stop`);
        return response.data;
    },

    // 7. Get Bot Trade Logs
    getLogs: async (id: number, skip: number = 0, limit: number = 50): Promise<LeadLagTradeLog[]> => {
        const response = await apiClient.get<LeadLagTradeLog[]>(`/lead-lag-bot/${id}/logs?skip=${skip}&limit=${limit}`);
        return response.data;
    }
};
