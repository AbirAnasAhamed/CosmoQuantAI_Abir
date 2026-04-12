import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { HeatmapDataPoint } from '../components/features/market/LiquidityHeatmapRenderer';

export const useHeatmapData = (symbol: string, exchange: string) => {
    const [heatmapData, setHeatmapData] = useState<HeatmapDataPoint[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        let isMounted = true;
        setHeatmapData([]); // Clear previous data when symbol/exchange changes

        const fetchHeatmap = async () => {
            if (!symbol || !exchange) return;

            try {
                const res = await api.get('/market-depth/heatmap', {
                    params: {
                        symbol: symbol.toUpperCase(),
                        exchange,
                        bucket_size: 50.0,
                        depth: 100
                    }
                });

                if (!isMounted) return;

                const { bids, asks } = res.data;
                const now = Math.floor(Date.now() / 1000); // Unix timestamp

                const newPoint: HeatmapDataPoint = {
                    time: now,
                    levels: []
                };

                if (bids && Array.isArray(bids)) {
                    bids.forEach((bid: any) => {
                        newPoint.levels.push({
                            price: bid.price,
                            volume: bid.volume,
                            type: 'bid'
                        });
                    });
                }

                if (asks && Array.isArray(asks)) {
                    asks.forEach((ask: any) => {
                        newPoint.levels.push({
                            price: ask.price,
                            volume: ask.volume,
                            type: 'ask'
                        });
                    });
                }

                setHeatmapData(prev => {
                    const uniqueDataMap = new Map<number, HeatmapDataPoint>();
                    
                    // Add previous data
                    prev.forEach(item => uniqueDataMap.set(item.time, item));
                    
                    // Add new point (overwrites if same time)
                    uniqueDataMap.set(newPoint.time, newPoint);
                    
                    // Sort descending by time (newest last)
                    const newData = Array.from(uniqueDataMap.values()).sort((a, b) => a.time - b.time);

                    // Keep last 200 points to prevent memory leak
                    if (newData.length > 200) {
                        return newData.slice(newData.length - 200);
                    }
                    return newData;
                });

                setError(null);
            } catch (err: any) {
                console.error("Failed to fetch heatmap data:", err);
                if (isMounted) setError("Failed to load heatmap data.");
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        const fetchHistorical = async () => {
            if (!symbol || !exchange) return;

            try {
                // Fetch last 1 hour of data
                const end = new Date();
                const start = new Date(end.getTime() - 60 * 60 * 1000);

                const res = await api.get('/market-depth/heatmap/historical', {
                    params: {
                        symbol: symbol.toUpperCase(),
                        exchange,
                        start_time: start.toISOString(),
                        end_time: end.toISOString(),
                        interval: "1m"
                    }
                });

                if (!isMounted) return;

                const snapshots = res.data.snapshots || [];
                const historicalPoints: HeatmapDataPoint[] = [];

                snapshots.forEach((snap: any) => {
                    const pointTime = Math.floor(new Date(snap.timestamp).getTime() / 1000);
                    const point: HeatmapDataPoint = {
                        time: pointTime,
                        levels: []
                    };
                    
                    if (snap.bids && Array.isArray(snap.bids)) {
                        snap.bids.forEach((bid: any) => {
                            point.levels.push({
                                price: bid.price,
                                volume: bid.volume,
                                type: 'bid'
                            });
                        });
                    }
                    if (snap.asks && Array.isArray(snap.asks)) {
                        snap.asks.forEach((ask: any) => {
                            point.levels.push({
                                price: ask.price,
                                volume: ask.volume,
                                type: 'ask'
                            });
                        });
                    }
                    historicalPoints.push(point);
                });

                // Sort ascending by time (from oldest to newest) just in case API order is off
                historicalPoints.sort((a, b) => a.time - b.time);

                setHeatmapData(historicalPoints);
            } catch (err: any) {
                console.error("Failed to fetch historical heatmap data:", err);
            }
        };

        const init = async () => {
            setLoading(true);
            await fetchHistorical();
            await fetchHeatmap(); // Fetch current

            // Poll every 5 seconds (matching Redis TTL in backend)
            intervalRef.current = setInterval(fetchHeatmap, 5000);
        };

        init();

        return () => {
            isMounted = false;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [symbol, exchange]);

    return { heatmapData, loading, error };
};
