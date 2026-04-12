import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/context/ToastContext';
import { getExchangeList, getExchangeMarkets, syncMarketData } from '@/services/backtester';
import { useMarketStore } from '@/store/marketStore';

export const useMarketData = () => {
    const { showToast } = useToast();
    const [exchanges, setExchanges] = useState<string[]>([]);
    const [markets, setMarkets] = useState<string[]>([]);
    const { globalExchange: selectedExchange, setGlobalExchange: setSelectedExchange, globalSymbol: symbol, setGlobalSymbol: setSymbol } = useMarketStore();
    const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);

    // Sync States
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [syncStatusText, setSyncStatusText] = useState("Initializing connection...");

    // Initial Data Fetching
    useEffect(() => {
        const initData = async () => {
            try {
                const exList = await getExchangeList();
                setExchanges(exList);
                if (exList.length > 0) setSelectedExchange(exList[0]);
            } catch (e) { console.error(e); }
        };
        initData();
    }, []);

    // Load Markets when Exchange Changes
    useEffect(() => {
        const loadMarkets = async () => {
            if (!selectedExchange) return;
            setIsLoadingMarkets(true);
            try {
                const pairs = await getExchangeMarkets(selectedExchange);
                setMarkets(pairs);
                const defaultPair = pairs.includes('BTC/USDT') ? 'BTC/USDT' : pairs[0];
                setSymbol(defaultPair || '');
            } catch (error) { showToast('Failed to load market pairs', 'error'); }
            finally { setIsLoadingMarkets(false); }
        };
        loadMarkets();
    }, [selectedExchange]);

    // WebSocket Connection for Sync Progress
    useEffect(() => {
        let ws: WebSocket | null = null;
        let reconnectTimeout: NodeJS.Timeout;

        const connectWebSocket = () => {
            if (!isSyncing) return;

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.hostname;
            // Port fallback if strict CSP or different port
            const port = '8000';
            const safeSymbol = symbol ? symbol.replace('/', '') : 'BTCUSDT';
            const wsUrl = `${protocol}/${host}:${port}/ws/market-data/${safeSymbol}`;

            console.log("Connecting to Sync WS:", wsUrl);
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log("✅ Connected to Sync WS");
                setSyncStatusText("Connected. Fetching data...");
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === "sync_progress") {
                        setSyncProgress(data.percent || 0);
                        setSyncStatusText(data.status || "Syncing data...");

                        if (data.percent >= 100) {
                            setTimeout(() => {
                                setIsSyncing(false);
                                showToast('Data Sync Completed Successfully!', 'success');
                            }, 1500);
                        }
                    }
                } catch (err) {
                    console.warn("WS Message Parse Error", err);
                }
            };

            ws.onerror = (event) => {
                console.error("WS Error (Market Data):", event);
                setSyncStatusText("Connection issue, retrying...");
            };

            ws.onclose = (event) => {
                console.log(`Market Data WS closed: ${event.code}`);
                if (isSyncing && event.code !== 1000) {
                    reconnectTimeout = setTimeout(connectWebSocket, 3000);
                }
            };
        };

        if (isSyncing) {
            connectWebSocket();
        }

        return () => {
            if (ws) ws.close();
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
        };
    }, [isSyncing, symbol]);

    const handleSyncData = async (timeframe: string, startDate: string, endDate: string) => {
        setIsSyncing(true);
        setSyncProgress(0);
        setSyncStatusText("Initiating Sync Request...");

        try {
            const response = await syncMarketData(symbol, timeframe, startDate, endDate);
            if (response.status === 'error') {
                showToast(`Sync Failed: ${response.message}`, 'error');
                setIsSyncing(false);
            } else {
                showToast(`Sync started for ${symbol}...`, 'info');
            }
        } catch (error) {
            console.error(error);
            showToast('Failed to initiate sync.', 'error');
            setIsSyncing(false);
        }
    };

    return {
        exchanges,
        selectedExchange,
        setSelectedExchange,
        markets,
        symbol,
        setSymbol,
        isLoadingMarkets,
        isSyncing,
        syncProgress,
        syncStatusText,
        handleSyncData
    };
};
