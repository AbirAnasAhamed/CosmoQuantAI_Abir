import apiClient from './client';
import { CointegratedPair } from '@/types';

export interface PerformanceMetrics {
    sharpe_ratio: number;
    max_drawdown: number;
    win_rate: number;
    total_trades: number;
    total_pnl: number;
    start_date?: string;
    end_date?: string;
}

export interface CorrelationResponse {
    matrix: Record<string, Record<string, number>>;
    lead_lag_matrix?: Record<string, Record<string, number>>;
    cointegrated_pairs: {
        asset_a: string;
        asset_b: string;
        score: number;
        p_value: number;
        is_cointegrated: boolean;
        z_score: number;
    }[];
}

export const getPerformanceMetrics = async (startDate?: string, endDate?: string): Promise<PerformanceMetrics> => {
    const params: any = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;

    const response = await apiClient.get('/analytics/performance', { params });
    return response.data;
};

export const fetchCorrelationMatrix = async (symbols: string[], timeframe: string = '1h'): Promise<CorrelationResponse> => {
    const response = await apiClient.post<CorrelationResponse>('/analytics/correlation-matrix', { symbols, timeframe });
    return response.data;
};

export interface RollingCorrelationPoint {
    time: string;
    value: number;
}

export const fetchRollingCorrelation = async (symbol_a: string, symbol_b: string, timeframe: string = '1h', window: number = 30): Promise<RollingCorrelationPoint[]> => {
    const response = await apiClient.get<RollingCorrelationPoint[]>('/analytics/correlation/rolling', {
        params: { symbol_a, symbol_b, timeframe, window }
    });
    return response.data;
};
