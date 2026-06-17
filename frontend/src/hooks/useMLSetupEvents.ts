import { useState, useEffect, useRef } from 'react';

export interface MLSetupEvent {
    type: string;
    symbol: string;
    side: string;
    sl_price: number;
    tp_price: number;
    rr_ratio: number;
    confidence: number;
    timestamp: number;
}

export const useMLSetupEvents = (symbol: string) => {
    const [mlSetup, setMlSetup] = useState<MLSetupEvent | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!symbol) return;

        const connect = () => {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const apiUrl = (import.meta as any).env?.VITE_API_URL as string | undefined;
            const host = apiUrl
                ? apiUrl.replace(/^https?:\/\//, '')
                : window.location.host;

            const wsUrl = `${wsProtocol}//${host}/api/v1/market-depth/ws/events?symbol=${encodeURIComponent(symbol)}`;

            wsRef.current = new WebSocket(wsUrl);

            wsRef.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'ML_ADVANCED_SETUP') {
                        data.timestamp = Date.now();
                        setMlSetup(data);
                    }
                } catch (_err) {
                    // ignore parse errors
                }
            };

            wsRef.current.onerror = () => {
                // silent fail
            };

            wsRef.current.onclose = () => {
                // Reconnect after 5s if still mounted
                reconnectTimerRef.current = window.setTimeout(connect, 5000);
            };
        };

        const reconnectTimerRef = { current: 0 };
        connect();

        return () => {
            window.clearTimeout(reconnectTimerRef.current);
            wsRef.current?.close();
        };
    }, [symbol]);

    return mlSetup;
};
