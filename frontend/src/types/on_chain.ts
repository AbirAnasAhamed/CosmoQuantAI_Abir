export interface OnChainMetric {
    symbol: string;
    exchange_inflow_volume: number;
    exchange_outflow_volume: number;
    net_flow_status: 'High Sell Pressure' | 'Strong Buying Pressure' | 'Neutral';
    timestamp: string;
}
