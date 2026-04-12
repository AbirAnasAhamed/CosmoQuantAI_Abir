import { useEffect, useRef, useState } from 'react';
import { ActiveBot } from '@/types';

interface BotStatusUpdate {
    id: string;
    status: 'active' | 'inactive' | 'paused';
    pnl: number;
    pnl_percent: number;
    total_pnl?: number;
    price: number;
    position: boolean;
}

export const useBotStatus = (bot: ActiveBot) => {
    const [liveBot, setLiveBot] = useState<ActiveBot>(bot);
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);

    // Sync state with prop when parent updates it (e.g. toggling status)
    useEffect(() => {
        setLiveBot(bot);
    }, [bot]);

    // ✅ Heartbeat / Watchdog
    const lastPongRef = useRef<number>(Date.now());

    // Watchdog Timer
    useEffect(() => {
        if (!isConnected) return; // Only watch if connected

        const watchdog = setInterval(() => {
            const now = Date.now();
            // 45s timeout (Frontend tolerance > Backend 30s)
            if (now - lastPongRef.current > 45000) {
                console.warn(`⚠️ WebSocket Watchdog: No ping for 45s. Reconnecting bot ${bot.id}...`);
                // Force close to trigger auto-reconnect logic or just set state
                if (wsRef.current) {
                    wsRef.current.close(4000, "Watchdog Timeout");
                    // Code 4000 can be custom
                }
                setIsConnected(false);
            }
        }, 10000); // Check every 10s

        return () => clearInterval(watchdog);
    }, [isConnected, bot.id]);

    useEffect(() => {
        // Only connect if the bot is actually active or we want to listen for activation
        // For now, let's connect if the bot is active OR if we want to see it go active.
        // Actually, if we want to see it go active, we need to listen. 
        // But for efficiency, maybe only if status is 'active' or checking enabled.

        // Let's connect always for now, but gracefully handle errors.
        if (bot.status !== 'active') {
            // If bot is inactive, maybe we don't need a socket?
            // But if we start it, we want to see it become active immediately.
            // The control action returns a response, but the stream is consistent.
            // Let's rely on the list refresh for status changes from inactive->active,
            // and use WS for active bots.
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const finalUrl = `${protocol}//${host}/api/v1/bots/${bot.id}/ws/status`;

        const connect = () => {
            const ws = new WebSocket(finalUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                setIsConnected(true);
                lastPongRef.current = Date.now(); // Reset timer on connect
            };

            ws.onclose = () => setIsConnected(false);

            ws.onmessage = (event) => {
                try {
                    const data: any = JSON.parse(event.data);

                    // ✅ Handle Ping
                    if (data.type === 'ping') {
                        // console.debug("🏓 Pong received");
                        lastPongRef.current = Date.now();
                        return; // Do not process as status update
                    }

                    // Merge update into bot state
                    setLiveBot(prev => ({
                        ...prev,
                        status: data.status,
                        pnl: data.pnl,
                        pnlPercent: data.pnl_percent,
                        totalPnl: data.total_pnl !== undefined ? data.total_pnl : prev.totalPnl,
                        // Update market price if available in bot object (optional)
                        // Market price is usually global, but pnl is specific
                    }));
                } catch (e) {
                    console.error("Bot Status WS Parse Error", e);
                }
            };
        };

        connect();

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [bot.id, bot.status]);

    return { liveBot, isConnected };
};
