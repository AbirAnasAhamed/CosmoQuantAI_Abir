
import { useEffect, useState, useRef } from 'react';
import { BlockTrade, BlockTradePayload } from '../types/blockTrade';
import { useToast } from '@chakra-ui/react';

export const useBlockTradeSocket = () => {
    const [trades, setTrades] = useState<BlockTrade[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);
    const toast = useToast();

    useEffect(() => {
        let isMounted = true;
        let reconnectTimeout: NodeJS.Timeout;

        // Correct WS URL based on environment
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let host = window.location.host;
        
        // In development (localhost:5173), point to backend port :8000
        // unless Vite proxy is configured
        if (host.includes('localhost:5173') || host.includes('127.0.0.1:5173')) {
            host = host.replace('5173', '8000');
        }
        
        const wsUrl = `${wsProtocol}//${host}/ws/block_trades`;

        const connect = () => {
            if (!isMounted) return;

            const socket = new WebSocket(wsUrl);
            socketRef.current = socket;

            socket.onopen = () => {
                if (!isMounted) {
                    // React StrictMode double-invoke: component unmounted before connection
                    // established — close silently without triggering reconnect
                    socket.onclose = null;
                    socket.close();
                    return;
                }
                console.log('✅ Connected to Block Trade WebSocket');
                setIsConnected(true);
            };

            socket.onmessage = (event) => {
                if (!isMounted) return;
                try {
                    const payload: BlockTradePayload = JSON.parse(event.data);

                    if (payload.type === 'block_trade' && payload.data) {
                        const newTrades = payload.data;

                        setTrades(prevTrades => {
                            // Keep buffer of last 50 trades
                            const updated = [...newTrades, ...prevTrades].slice(0, 50);
                            return updated;
                        });

                        // Optional: Show toast for Whale Activity
                        newTrades.forEach(trade => {
                            if (trade.is_whale) {
                                toast({
                                    title: "🐳 WHALE ALERT",
                                    description: `${trade.side.toUpperCase()} ${trade.amount} ${trade.symbol} ($${trade.value.toLocaleString()}) on ${trade.exchange}`,
                                    status: "info",
                                    duration: 5000,
                                    isClosable: true,
                                    position: "top-right"
                                });
                            }
                        });
                    }
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            socket.onclose = () => {
                if (!isMounted) return; // Suppress StrictMode cleanup-triggered close
                console.log('❌ Disconnected from Block Trade WebSocket');
                setIsConnected(false);
                // Reconnect after 3 seconds
                reconnectTimeout = setTimeout(connect, 3000);
            };

            socket.onerror = (error) => {
                if (!isMounted) return; // Suppress StrictMode-triggered error
                console.error('WebSocket Error:', error);
                // onclose will handle reconnect automatically
            };
        };

        connect();

        return () => {
            isMounted = false;
            clearTimeout(reconnectTimeout);
            if (socketRef.current) {
                // Null out handlers before closing to prevent reconnect loop
                socketRef.current.onclose = null;
                socketRef.current.onerror = null;
                // Only close if not already closing/closed
                if (
                    socketRef.current.readyState === WebSocket.OPEN ||
                    socketRef.current.readyState === WebSocket.CONNECTING
                ) {
                    socketRef.current.close();
                }
                socketRef.current = null;
            }
        };
    }, [toast]);

    return { trades, isConnected };
};
