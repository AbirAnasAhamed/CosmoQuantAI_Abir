import apiClient from './client';

export interface BotSummary {
    id: number;
    name: string;
    market: string;
    strategy: string;
    pnl: number;
    pnl_percent: number;
    status: string;
}

export interface PortfolioValuePoint {
    name: string;
    value: number;
}

export interface AllocationPoint {
    name: string;
    value: number;
}

export interface BacktestSummary {
    id: number;
    strategy: string;
    market: string;
    timeframe: string;
    date: string;
    profit_percent: number;
    max_drawdown: number;
    win_rate: number;
    sharpe_ratio: number;
}

export interface DashboardSummary {
    total_equity: number;
    equity_change_24h: number;
    total_profit_24h: number;
    profit_change_24h: number;
    active_bots: number;
    avg_win_rate: number;
    win_rate_change_24h: number;
    bots: BotSummary[];
    portfolio_value: PortfolioValuePoint[];
    portfolio_allocation: AllocationPoint[];
    recent_backtests: BacktestSummary[];
}

export const getDashboardSummary = async (): Promise<DashboardSummary> => {
    const response = await apiClient.get('/dashboard/summary');
    return response.data;
};
