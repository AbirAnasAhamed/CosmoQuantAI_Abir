import { useState, useEffect, useRef } from 'react';

const WEBSOCKET_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/api/v1/advanced_liquidation/ws/god-mode';

export interface GodModeState {
    symbol: string;
    current_price: number;
    vulnerability: any[];
    arbitrage: any[];
    pain_threshold: { level: number; status: string; value: number };
    smart_money: number;
    dumb_money: number;
    cvd_spoof: string;
    whale_feed: any[];
    magnet_zones: any[];
    cascade_probs: any[];
}

export const useGodModeWebsocket = (symbol: string = 'BTC/USDT') => {
    const [state, setState] = useState<GodModeState | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const connect = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const encodedSymbol = encodeURIComponent(symbol);
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/api/v1/advanced_liquidation/ws/god-mode?symbol=${encodedSymbol}`;
        
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log(`[GodMode WS] Connected for ${symbol}`);
            setIsConnected(true);
        };

        ws.onmessage = (event) => {
            try {
                const data: GodModeState = JSON.parse(event.data);
                setState(data);
            } catch (error) {
                console.error('[GodMode WS] Parsing error:', error);
            }
        };

        ws.onclose = () => {
            console.log(`[GodMode WS] Disconnected`);
            setIsConnected(false);
            // Auto reconnect
            reconnectTimeoutRef.current = setTimeout(() => {
                connect();
            }, 3000);
        };

        ws.onerror = (error) => {
            console.error('[GodMode WS] WebSocket error:', error);
            ws.close();
        };

        wsRef.current = ws;
    };

    useEffect(() => {
        connect();

        return () => {
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [symbol]);

    return { state, isConnected };
};
