import { create } from 'zustand';

interface MarketState {
    globalExchange: string;
    setGlobalExchange: (exchange: string) => void;
    globalSymbol: string;
    setGlobalSymbol: (symbol: string) => void;
    globalInterval: string;
    setGlobalInterval: (interval: string) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
    globalExchange: 'binance',
    setGlobalExchange: (exchange) => set({ globalExchange: exchange }),
    globalSymbol: 'DOGE/USDT',
    setGlobalSymbol: (symbol) => set({ globalSymbol: symbol }),
    globalInterval: '1m',
    setGlobalInterval: (interval) => set({ globalInterval: interval }),
}));
