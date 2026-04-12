import { useState, useEffect, useRef } from 'react';

export interface WallHunterStatusData {
    status: string;
    pnl: number;
    pnl_percent: number;
    price: number;
    position: boolean;
    entry_price: number;
    sl_price: number;
    tp_price: number;
    target_spread: number;
    vol_threshold: number;
    absorption_delta?: number;
    is_absorbing?: boolean;
    total_pnl?: number;
    total_orders?: number;
    total_wins?: number;
    total_losses?: number;
    mode?: string;
}

export const useWallHunterStatus = (botId: number | null) => {
    const [statusData, setStatusData] = useState<WallHunterStatusData | null>(null);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!botId) {
            setStatusData(null);
            setIsConnected(false);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            return;
        }

        let isSubscribed = true;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/api/v1/bots/${botId}/ws/status`;

        const connect = () => {
            try {
                const ws = new WebSocket(wsUrl);
                wsRef.current = ws;

                ws.onopen = () => {
                    console.log(`Connected to WallHunter Status Stream for Bot ${botId}`);
                    if (isSubscribed) setIsConnected(true);
                };

                ws.onmessage = (event) => {
                    if (!isSubscribed) return;
                    try {
                        const dataMsg = JSON.parse(event.data);
                        if (dataMsg.type !== "ping") {
                            setStatusData(dataMsg);
                        }
                    } catch (e) {
                        console.error("Failed to parse WallHunter status message", e);
                    }
                };

                ws.onerror = (err) => {
                    console.error(`WebSocket error on WallHunter ${botId}:`, err);
                };

                ws.onclose = () => {
                    console.log(`Disconnected from WallHunter ${botId}. Reconnecting in 5s...`);
                    if (isSubscribed) {
                        setIsConnected(false);
                        wsRef.current = null;
                        setTimeout(connect, 5000);
                    }
                };
            } catch (error) {
                console.error("Error creating Bot Status WebSocket:", error);
                if (isSubscribed) {
                    setIsConnected(false);
                    setTimeout(connect, 5000);
                }
            }
        };

        connect();

        return () => {
            isSubscribed = false;
            setIsConnected(false);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [botId]);

    return { statusData, isConnected };
};
