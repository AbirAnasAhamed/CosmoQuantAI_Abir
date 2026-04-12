
import React, { useEffect, useState } from 'react';

interface WhaleAlert {
    symbol: string;
    volume: number;
    price: number;
    timestamp: string;
    exchange: string;
}

const WhaleMovementWidget: React.FC<{ limit?: number }> = ({ limit = 5 }) => {
    const [alerts, setAlerts] = useState<WhaleAlert[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchAlerts = async () => {
            try {
                // Use relative path via Vite Proxy
                const response = await fetch(`/api/v1/whale-alerts/recent?limit=${limit}`);
                if (response.ok) {
                    const data = await response.json();
                    setAlerts(data);
                }
            } catch (error) {
                console.error("Failed to fetch whale alerts", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAlerts();
        const interval = setInterval(fetchAlerts, 60000); // Refresh every minute
        return () => clearInterval(interval);
    }, [limit]);

    return (
        <div className="rounded-2xl bg-white dark:bg-brand-dark border border-brand-border-light dark:border-brand-border-dark p-6 shadow-lg staggered-fade-in">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">🐋</span> Recent Whale Movements
            </h2>

            {isLoading ? (
                <div className="text-center py-4 text-gray-500">Scanning ocean...</div>
            ) : alerts.length === 0 ? (
                <div className="text-center py-4 text-gray-500">No recent whale activity.</div>
            ) : (
                <div className="space-y-3">
                    {alerts.map((alert, index) => (
                        <div key={index} className="flex justify-between items-center p-3 rounded-xl bg-gray-50 dark:bg-brand-darkest/50 border border-transparent hover:border-brand-primary/30 transition-all">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 font-bold text-xs">
                                    {alert.exchange.toUpperCase().substring(0, 3)}
                                </div>
                                <div>
                                    <p className="font-bold text-sm text-slate-900 dark:text-white">{alert.symbol}</p>
                                    <p className="text-xs text-gray-500">{new Date(alert.timestamp).toLocaleTimeString()}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-sm text-brand-primary">
                                    {alert.volume.toFixed(2)} {alert.symbol.split('/')[0] || alert.symbol}
                                </p>
                                <p className="text-xs text-gray-500">
                                    @ ${alert.price.toLocaleString()}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default WhaleMovementWidget;
