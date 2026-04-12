import { useState, useEffect, useRef } from 'react';

// Define the shape of the data we expect from the socket
export interface VoteUpdatePayload {
    bullish_pct: number;
    bearish_pct: number;
    total_votes: number;
}

export interface WebSocketMessage {
    type: 'VOTE_UPDATE' | 'PRICE_UPDATE' | 'SENTIMENT_UPDATE';
    data: VoteUpdatePayload | any; // Use stricter types as needed
}

export const useSentimentSocket = (activePair: string) => {
    const [realTimeData, setRealTimeData] = useState<WebSocketMessage | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!activePair) return;

        let isSubscribed = true;

        const connect = () => {
            // Close existing connection if any
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.close();
            }

            // Construct WebSocket URL using current window location to support proxied environments
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            const wsUrl = `${protocol}//${host}/api/v1/sentiment/ws/${activePair}`;

            console.log(`🔌 Connecting to Sentiment WS: ${wsUrl}`);
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                if (!isSubscribed) {
                    ws.close();
                    return;
                }
                console.log('✅ Sentiment WS Connected');
                setIsConnected(true);
            };

            ws.onmessage = (event) => {
                if (!isSubscribed) return;
                try {
                    const message: WebSocketMessage = JSON.parse(event.data);
                    // console.log('📩 WS Message:', message);
                    setRealTimeData(message);
                } catch (error) {
                    console.error('❌ Failed to parse WS message:', error);
                }
            };

            ws.onclose = () => {
                if (!isSubscribed) return;
                console.log('⚠️ Sentiment WS Disconnected');
                setIsConnected(false);
                // Attempt reconnect after 3 seconds
                reconnectTimeoutRef.current = setTimeout(() => {
                    if (isSubscribed) {
                        console.log('🔄 Reconnecting...');
                        connect();
                    }
                }, 3000);
            };

            ws.onerror = (error) => {
                if (!isSubscribed) return;
                console.error('❌ Sentiment WS Error:', error);
                ws.close();
            };
        };

        connect();

        return () => {
            isSubscribed = false;
            if (wsRef.current) {
                // Prevent onclose handle from triggering during component unmount
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.close();
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [activePair]);

    return { realTimeData, isConnected };
};
