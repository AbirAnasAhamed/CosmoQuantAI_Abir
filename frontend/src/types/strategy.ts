export interface RSIParams {
    period: number;
    lower: number;
    upper: number;
    [key: string]: number; // Index signature for dynamic access if needed, but keeping it strict is better. 
    // However, the generic renderer in Modal uses Object.keys, so index signature helps avoid complex casting there.
    // But I will try to avoid index signature if possible to be strict. 
    // Let's add it for now to be safe with the generic loop, or I will handle it in the component.
    // Update: I will NOT include index signature here to enforce strictness, and cast in the component.
}

export interface MACDParams {
    fast_period: number;
    slow_period: number;
    signal_period: number;
}

export interface BollingerBandsParams {
    period: number;
    devfactor: number;
}

export interface SMACrossParams {
    fast_period: number;
    slow_period: number;
}

export type StrategyParams = RSIParams | MACDParams | BollingerBandsParams | SMACrossParams;

export const DEFAULT_RSI_PARAMS: RSIParams = { period: 14, lower: 30, upper: 70 };
export const DEFAULT_MACD_PARAMS: MACDParams = { fast_period: 12, slow_period: 26, signal_period: 9 };
export const DEFAULT_BB_PARAMS: BollingerBandsParams = { period: 20, devfactor: 2.0 };
export const DEFAULT_SMA_PARAMS: SMACrossParams = { fast_period: 10, slow_period: 30 };
