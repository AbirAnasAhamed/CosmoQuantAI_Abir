import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { toast } from 'react-hot-toast';

export interface IcebergEvent {
    type: string;
    symbol: string;
    side: string;
    price: number;
    absorbed_vol: number;
    limit_vol_remaining: number;
    timestamp: number;
}

export const useIcebergEvents = (symbol: string) => {
    const [events, setEvents] = useState<IcebergEvent[]>([]);
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
                    const data: IcebergEvent = JSON.parse(event.data);
                    if (data.type === 'ICEBERG_DETECTED') {
                        data.timestamp = Date.now();
                        setEvents(prev => [...prev.slice(-49), data]);

                        const isBuy = data.side === 'buy';
                        const emoji = isBuy ? '🔥' : '🩸';
                        const color = isBuy ? '#3b82f6' : '#ef4444';
                        const borderColor = isBuy ? 'border-blue-500' : 'border-red-500';
                        const textColor = isBuy ? 'text-blue-400' : 'text-red-400';
                        const absorbedFormatted = data.absorbed_vol.toLocaleString(undefined, { maximumFractionDigits: 0 });

                        toast.custom((t) =>
                            React.createElement('div', {
                                key: t.id,
                                className: `bg-[#0f172a] border ${borderColor} border-l-4 p-4 rounded-lg shadow-xl text-white min-w-[300px] flex items-start gap-3 cursor-pointer`,
                                onClick: () => toast.dismiss(t.id),
                            },
                                React.createElement('div', { className: 'text-2xl leading-none mt-0.5' }, emoji),
                                React.createElement('div', { className: 'flex-1' },
                                    React.createElement('h3', { className: `font-bold ${textColor} mb-1 text-sm uppercase tracking-wide` },
                                        `Hidden Iceberg ${data.side.toUpperCase()} Wall`
                                    ),
                                    React.createElement('p', { className: 'text-xs text-gray-300' },
                                        'Price: ',
                                        React.createElement('span', { className: `font-mono font-bold ${textColor}` }, data.price)
                                    ),
                                    React.createElement('p', { className: 'text-xs text-gray-300 mt-0.5' },
                                        'Absorbed: ',
                                        React.createElement('span', { className: 'font-mono font-bold text-white' }, `$${absorbedFormatted}`)
                                    ),
                                    React.createElement('p', { className: 'text-[10px] text-gray-500 mt-1.5' },
                                        'Institutional Reload Detected — Click to dismiss'
                                    )
                                )
                            ),
                            { duration: 8000, position: 'bottom-right' }
                        );
                    }
                } catch (_err) {
                    // ignore parse errors
                }
            };

            wsRef.current.onerror = () => {
                // silent fail — WS may not be available in dev without bot running
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

    return events;
};
