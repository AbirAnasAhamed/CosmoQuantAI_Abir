import { useState, useEffect, useRef } from 'react';

export interface GodModeState {
    symbol: string;
    vulnerability: any[];
    arbitrage: any[];
    pain_threshold: { level: number, status: string, value: number };
    smart_money: number;
    dumb_money: number;
    cvd_spoof: string;
    whale_feed: any[];
    magnet_zones: { price: number, intensity: number, leverage?: string, type?: string }[];
    ai_trajectory?: { direction: string, target_price: number, confidence: number } | null;
    cascade_probs: { price: number, prob: number }[];
    current_price: number;
}

export const useGodModeData = (symbol: string, numZones: number = 3, minVol: number = 0) => {
    const [godModeData, setGodModeData] = useState<GodModeState | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    // Send config when it changes
    useEffect(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                action: 'update_config',
                num_zones: numZones,
                min_vol: minVol
            }));
        }
    }, [numZones, minVol]);

    useEffect(() => {
        if (!symbol) return;

        // Ensure slash is kept raw since fastapi endpoint uses {symbol:path}
        // e.g. BTC/USDT
        const targetSymbol = encodeURIComponent(symbol).replace('%2F', '/');
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const baseUrl = `${protocol}//${window.location.host}`;
        const wsUrl = `${baseUrl}/ws/godmode/${targetSymbol}`;

        let ws: WebSocket;
        let reconnectTimeout: NodeJS.Timeout;
        let isSubscribed = true;

        const connect = () => {
            if (!isSubscribed) return;
            ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log(`📡 Connected to God Mode Stream: ${symbol}`);
                // Send initial config on connect
                ws.send(JSON.stringify({
                    action: 'update_config',
                    num_zones: numZones,
                    min_vol: minVol
                }));
            };

            ws.onmessage = (event) => {
                if (!isSubscribed) return;
                try {
                    const data = JSON.parse(event.data);
                    // Handle broadcast wrapping if present
                    const payload = data.data || data; 
                    if (payload && payload.magnet_zones !== undefined) {
                        setGodModeData(payload);
                    }
                } catch (e) {
                    // silently fail on parse error to avoid spam
                }
            };

            ws.onerror = (error) => {
                console.error('God Mode WebSocket error:', error);
            };

            ws.onclose = () => {
                if (!isSubscribed) return;
                console.log('God Mode Disconnected. Reconnecting in 3s...');
                reconnectTimeout = setTimeout(connect, 3000);
            };
        };

        connect();

        return () => {
            isSubscribed = false;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (ws) {
                ws.onclose = null;
                ws.close();
            }
        };
    }, [symbol]);

    return godModeData;
};
