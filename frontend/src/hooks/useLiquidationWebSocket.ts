import { useState, useEffect, useRef, useCallback } from 'react';

export interface LiquidationEvent {
    id: number;
    time: string;
    type: 'Long' | 'Short';
    amount: number;
    price: number;
    symbol?: string;
    timestamp: number; // Raw timestamp for charting
    isNew?: boolean;
    isWhale?: boolean;
}

export interface CldData {
    time: number;
    value: number;
}

export interface AggregatedStats {
    longLiqs: number;
    shortLiqs: number;
    totalVol: number;
}

const MAX_FEED_LENGTH = 50; // Increased buffer
const MAX_CLD_POINTS = 100;

export const useLiquidationWebSocket = (activeExchange: string, activePair: string) => {
    const [isConnected, setIsConnected] = useState(false);
    const [liveFeed, setLiveFeed] = useState<LiquidationEvent[]>([]);
    const [cldData, setCldData] = useState<CldData[]>([]);
    const [aggregatedStats, setAggregatedStats] = useState<AggregatedStats>({ longLiqs: 0, shortLiqs: 0, totalVol: 0 });
    const [currentPrice, setCurrentPrice] = useState<number>(0);
    const [priceUpdateStatus, setPriceUpdateStatus] = useState<'up' | 'down' | 'none'>('none');

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<any>(null);

    const connect = useCallback(() => {
        try {
            // detailed logging for debugging
            console.log(`Connecting to Liquidation Stream for ${activeExchange}:${activePair}...`);
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            const WS_URL = `${protocol}//${host}/api/v1/liquidation/ws/stream`;
            
            // Format symbol explicitly as it appears in CCXT (e.g., BTC/USDT or BTC/USDT:USDT)
            const params = new URLSearchParams({
                exchange: activeExchange.toLowerCase(),
                symbol: activePair
            });
            const ws = new WebSocket(`${WS_URL}?${params.toString()}`);

            ws.onopen = () => {
                console.log('Connected to Liquidation Stream');
                setIsConnected(true);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // --- 1. Global Feed Logic (Show EVERYTHING) ---
                    // We want the "Kill Feed" to be exciting, so we show all liquidations.

                    const isLong = data.type === 'Long Liquidation';
                    const amount = data.usd_value;
                    const price = data.price;
                    const eventSymbol = data.symbol;

                    const newEvent: LiquidationEvent = {
                        id: Date.now() + Math.random(),
                        time: new Date(data.timestamp).toLocaleTimeString(),
                        timestamp: data.timestamp, // Store raw timestamp
                        type: isLong ? 'Long' : 'Short',
                        amount: amount,
                        price: price,
                        symbol: eventSymbol, // Show symbol in feed
                        isNew: true,
                        isWhale: amount > 50000,
                    };

                    setLiveFeed(prev => {
                        const updated = [newEvent, ...prev.map(item => ({ ...item, isNew: false }))];
                        return updated.slice(0, MAX_FEED_LENGTH);
                    });

                    // Update Global Stats
                    setAggregatedStats(prev => ({
                        longLiqs: prev.longLiqs + (isLong ? amount : 0),
                        shortLiqs: prev.shortLiqs + (!isLong ? amount : 0),
                        totalVol: prev.totalVol + amount
                    }));

                    // --- 2. Active Pair Logic (Specific Updates) ---
                    // Only update Price and CLD if the symbol matches the active pair.

                    const normalizedSymbol = data.symbol.replace('/', '');
                    const targetSymbol = activePair.replace('/', '');

                    if (normalizedSymbol === targetSymbol) {
                        // Update Query Price
                        setCurrentPrice(prev => {
                            if (price > prev) setPriceUpdateStatus('up');
                            else if (price < prev) setPriceUpdateStatus('down');
                            else setPriceUpdateStatus('none');
                            setTimeout(() => setPriceUpdateStatus('none'), 500);
                            return price;
                        });

                        // Update CLD (Specific to this pair)
                        setCldData(prev => {
                            const lastValue = prev[prev.length - 1]?.value || 0;
                            const change = isLong ? -amount : amount;
                            const newValue = lastValue + change;
                            const newPoint = { time: data.timestamp, value: newValue };
                            return [...prev, newPoint].slice(-MAX_CLD_POINTS);
                        });
                    }

                } catch (e) {
                    console.error('Error parsing liquidation message:', e);
                }
            };

            ws.onclose = () => {
                console.log('Disconnected from Liquidation Stream');
                setIsConnected(false);
                reconnectTimeoutRef.current = setTimeout(connect, 3000);
            };

            ws.onerror = (err) => {
                console.error('WebSocket Error:', err);
                ws.close();
            };

            wsRef.current = ws;

        } catch (error) {
            console.error('Connection failed:', error);
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
    }, [activePair]);

    useEffect(() => {
        connect();
        return () => {
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.close();
            }
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        };
    }, [connect]);

    // Reset ONLY pair-specific data when pair changes
    useEffect(() => {
        setCldData([]);
        setCurrentPrice(0);
        // liveFeed and aggregatedStats are kept global
    }, [activePair]);

    return {
        isConnected,
        liveFeed,
        aggregatedStats,
        cldData,
        currentPrice,
        priceUpdateStatus
    };
};
