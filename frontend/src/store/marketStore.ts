import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type MarketType = 'crypto' | 'forex' | 'stocks' | 'commodities';

interface MarketState {
    activeMarket: MarketType;
    setActiveMarket: (market: MarketType) => void;
    globalExchange: string;
    setGlobalExchange: (exchange: string) => void;
    globalSymbol: string;
    setGlobalSymbol: (symbol: string) => void;
    globalInterval: string;
    setGlobalInterval: (interval: string) => void;
}

export const useMarketStore = create<MarketState>()(
    persist(
        (set) => ({
            activeMarket: 'crypto',
            setActiveMarket: (market) => set({ activeMarket: market }),
            globalExchange: 'binance',
            setGlobalExchange: (exchange) => set({ globalExchange: exchange }),
            globalSymbol: 'DOGE/USDT',
            setGlobalSymbol: (symbol) => set({ globalSymbol: symbol }),
            globalInterval: '15m',
            setGlobalInterval: (interval) => set({ globalInterval: interval }),
        }),
        {
            name: 'market-store-storage',
        }
    )
);
