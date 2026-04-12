import apiClient from './client';
import { MarketRegime } from '../types';

export interface RegimeHistoryItem {
    timestamp: string; // ISO string from backend
    close: number;
    regime: MarketRegime;
    log_return: number;
    volatility: number;
}

export interface RegimeResponse {
    current_regime: MarketRegime;
    trend_score: number;
    volatility_score: number;
    transition_matrix: number[][];
    regime_map: Record<string, string>;
    history: RegimeHistoryItem[];
}

export const fetchMarketRegime = async (): Promise<RegimeResponse> => {
    const response = await apiClient.get<RegimeResponse>('/analytics/regime');
    return response.data;
};
