
import { useEffect, useState, useRef } from 'react';
import { CorrelationResponse } from '@/services/analytics';

interface WebSocketMessage {
    type: string;
    data: CorrelationResponse;
}

export const useCorrelationSocket = (
    initialData: Record<string, any> | null,
    onAlert?: (message: string) => void
) => {
    const [isConnected, setIsConnected] = useState(false);
    const [socketData, setSocketData] = useState<CorrelationResponse | null>(null);
    const socketRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        // Construct WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host; // e.g. localhost:5173
        // Backend typically on port 8000 if not proxying, assuming proxy setup or direct:
        // Use environment variable or default to standard convention
        const wsUrl = `${protocol}//${host}/api/v1/analytics/ws/correlation`;

        console.log(`Connecting to WS: ${wsUrl}`);

        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
            console.log("WebSocket Connected");
            setIsConnected(true);
        };

        socket.onmessage = (event) => {
            try {
                const message: WebSocketMessage = JSON.parse(event.data);
                if (message.type === 'update') {
                    setSocketData(message.data);
                } else if (message.type === 'alert' && onAlert) {
                    // Check if it's a message object or just string
                    const msgText = (message as any).message || "Alert Received";
                    onAlert(msgText);
                }
            } catch (err) {
                console.error("Error parsing WS message:", err);
            }
        };

        socket.onclose = () => {
            console.log("WebSocket Disconnected");
            setIsConnected(false);
        };

        socket.onerror = (error) => {
            console.error("WebSocket Error:", error);
        };

        return () => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.close();
            }
        };
    }, []);

    return { isConnected, socketData };
};
