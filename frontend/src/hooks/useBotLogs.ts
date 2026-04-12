import { useState, useEffect, useRef } from 'react';

export interface BotLog {
    time: string;
    type: string;
    message: string;
}

export const useBotLogs = (botId: number | null) => {
    const [logs, setLogs] = useState<BotLog[]>([]);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!botId) {
            setLogs([]);
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
        // The endpoint defined in bots.py for historical + live logs
        const wsUrl = `${protocol}//${host}/api/v1/bots/${botId}/ws/logs`;

        const connect = () => {
            try {
                const ws = new WebSocket(wsUrl);
                wsRef.current = ws;

                ws.onopen = () => {
                    console.log(`Connected to Bot Logs Stream for Bot ${botId}`);
                    if (isSubscribed) {
                        setIsConnected(true);
                        // We do NOT clear logs here because reconnect might wipe them. 
                        // The backend will send the latest 50 logs upon connection anyway.
                    }
                };

                ws.onmessage = (event) => {
                    if (!isSubscribed) return;
                    try {
                        const dataMsg = JSON.parse(event.data);
                        if (dataMsg.type !== "ping") {
                            // Assume backend sends { time: "...", type: "...", message: "..." }
                            setLogs(prev => {
                                // Add to end, keep only last 200
                                const newLogs = [...prev, dataMsg];
                                if (newLogs.length > 200) {
                                    return newLogs.slice(newLogs.length - 200);
                                }
                                return newLogs;
                            });
                        }
                    } catch (e) {
                        console.error("Failed to parse Bot Log message", e);
                    }
                };

                ws.onerror = (err) => {
                    console.error(`WebSocket error on Bot Logs ${botId}:`, err);
                };

                ws.onclose = () => {
                    console.log(`Disconnected from Bot Logs ${botId}. Reconnecting in 5s...`);
                    if (isSubscribed) {
                        setIsConnected(false);
                        wsRef.current = null;
                        setTimeout(connect, 5000);
                    }
                };
            } catch (error) {
                console.error("Error creating Bot Logs WebSocket:", error);
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

    // Function to manually clear logs from UI
    const clearLogs = () => {
        setLogs([]);
    };

    return { logs, isConnected, clearLogs };
};
