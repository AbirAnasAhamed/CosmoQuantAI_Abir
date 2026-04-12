import { useState, useCallback, useEffect, useRef } from 'react';
import ccxt from 'ccxt';
import { useMarketStore } from '@/store/marketStore';

// Define the interface for the objects we want to return
export interface MarketPair {
    symbol: string;      // e.g. "BTC/USDT"
    baseId: string;      // e.g. "BTC"
    quoteId: string;     // e.g. "USDT"
    active: boolean;     // Whether the market is currently active
}

export const useCCXTMarkets = () => {
    // Filter to exchanges known to support liquidation streams well in CCXT Pro
    const supportedExchanges = ['binance', 'bybit', 'okx', 'kucoin', 'bitget', 'gateio', 'mexc', 'huobi'];
    const [exchanges] = useState<string[]>(
        ccxt.exchanges.filter(e => supportedExchanges.includes(e))
    );
    const { globalExchange: selectedExchange, setGlobalExchange: setSelectedExchange, globalSymbol: selectedPair, setGlobalSymbol: setSelectedPair } = useMarketStore();

    // Status tracking
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Data tracking
    const [markets, setMarkets] = useState<MarketPair[]>([]);
    const [quoteCurrencies, setQuoteCurrencies] = useState<string[]>([]);
    const [selectedQuote, setSelectedQuote] = useState<string>('USDT');
    const [availablePairs, setAvailablePairs] = useState<MarketPair[]>([]);

    // Load ALL markets for a given exchange
    const loadMarkets = useCallback(async (exchangeId: string) => {
        setIsLoading(true);
        setError(null);
        try {
            if (!ccxt.exchanges.includes(exchangeId)) {
                throw new Error(`Exchange ${exchangeId} is not supported by CCXT`);
            }

            // @ts-ignore
            const exchangeClass = ccxt[exchangeId];
            
            const exchangeOptions: any = { enableRateLimit: true, options: {} };
            if (exchangeId === 'binance') {
                exchangeOptions.options.defaultType = 'future';
            } else if (exchangeId === 'bybit' || exchangeId === 'okx' || exchangeId === 'bitget' || exchangeId === 'kucoin') {
                exchangeOptions.options.defaultType = 'swap';
            }
            
            const exchangeInstance = new exchangeClass(exchangeOptions);
            const rawMarkets = await exchangeInstance.loadMarkets();

            const parsedMarkets: MarketPair[] = [];
            const quotes = new Set<string>();

            Object.values(rawMarkets).forEach((market: any) => {
                if (market && market.symbol && market.active !== false) {
                    const quote = market.settle || market.quote;
                    const base = market.base;
                    
                    if (base && quote) {
                        if (market.symbol.includes('-') && !market.symbol.includes('PERP')) {
                             return;
                        }
                        
                        parsedMarkets.push({
                            symbol: market.symbol,
                            baseId: base,
                            quoteId: quote,
                            active: true
                        });
                        quotes.add(quote);
                    }
                }
            });

            parsedMarkets.sort((a, b) => a.symbol.localeCompare(b.symbol));
            const sortedQuotes = Array.from(quotes).sort();

            setMarkets(parsedMarkets);
            setQuoteCurrencies(sortedQuotes);

            let defaultQuote = sortedQuotes.includes('USDT') ? 'USDT'
                : sortedQuotes.includes('USDC') ? 'USDC'
                    : sortedQuotes[0] || '';

            setSelectedQuote(defaultQuote);
            
            // Replicate filterPairsByQuote logic directly to ensure no closure issues
            const filtered = parsedMarkets.filter(m => m.quoteId === defaultQuote);
            setAvailablePairs(filtered);
            if (filtered.length > 0) {
                const currentGlobalPair = useMarketStore.getState().globalSymbol;
                const hasCurrentPair = filtered.some(p => p.symbol === currentGlobalPair);
                if (!hasCurrentPair) {
                    const btcPair = filtered.find(p => p.baseId === 'BTC' || p.baseId === 'XBT');
                    setSelectedPair(btcPair ? btcPair.symbol : filtered[0].symbol);
                }
            } else {
                setSelectedPair('');
            }

        } catch (err: any) {
            console.error(`Error loading markets for ${exchangeId}:`, err);
            setError(err.message || 'Failed to fetch exchange pairs.');
            setMarkets([]);
            setQuoteCurrencies([]);
            setAvailablePairs([]);
        } finally {
            setIsLoading(false);
        }
    }, [setSelectedPair]);

    // Helper function to update the available pairs when a quote currency changes
    const filterPairsByQuote = useCallback((quote: string, allMarkets: MarketPair[] = markets) => {
        const filtered = allMarkets.filter(m => m.quoteId === quote);
        setAvailablePairs(filtered);

        if (filtered.length > 0) {
            const currentGlobalPair = useMarketStore.getState().globalSymbol;
            const hasCurrentPair = filtered.some(p => p.symbol === currentGlobalPair);
            if (!hasCurrentPair) {
                const btcPair = filtered.find(p => p.baseId === 'BTC' || p.baseId === 'XBT');
                setSelectedPair(btcPair ? btcPair.symbol : filtered[0].symbol);
            }
        } else {
            setSelectedPair('');
        }
    }, [markets, setSelectedPair]);

    // Whenever the exchange changes, load the markets
    useEffect(() => {
        if (selectedExchange) {
            loadMarkets(selectedExchange);
        }
    }, [selectedExchange, loadMarkets]);

    // Whenever the selected Quote changes, immediately filter the available pairs
    useEffect(() => {
        filterPairsByQuote(selectedQuote);
    }, [selectedQuote]);

    return {
        // Exchange selection state
        exchanges,
        selectedExchange,
        setSelectedExchange,

        // Quote currency (Base pairing) state
        quoteCurrencies,
        selectedQuote,
        setSelectedQuote,

        // Asset Pair state
        availablePairs,
        selectedPair,
        setSelectedPair,

        // Loading & Error states
        isLoading,
        error
    };
};
