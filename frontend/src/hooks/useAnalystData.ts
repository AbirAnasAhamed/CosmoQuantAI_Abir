import { useState, useEffect } from 'react';

// Define the shape of data exposed by the hook to AnalystResearch page
export interface AnalystData {
    tickers: string[];
    ratingsSummary: {
        data: { name: string; value: number; color: string }[];
        dominant: string;
    };
    ratingsData: {
        id: string;
        firm: string;
        date: string;
        rating: string;
        priceTarget: number | null;
    }[];
    priceTargetStats: {
        high: number;
        avg: number;
        low: number;
        upside: number;
    };
    currentPrice: number;
    reportsData: {
        id: string | number;
        title: string;
        summary: string;
        source: string;
        date: string;
        link: string;
    }[];
}

export const useAnalystData = (activeStock: string) => {
    const [data, setData] = useState<AnalystData | null>(null);
    const [tickers, setTickers] = useState<string[]>(['AAPL', 'TSLA', 'MSFT', 'NVDA', 'GOOGL']);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Initial load for tickers
    useEffect(() => {
        const fetchTickers = async () => {
            try {
                const res = await fetch('/api/v1/analyst/tickers');
                if (res.ok) {
                    const json = await res.json();
                    if (json.tickers && json.tickers.length > 0) {
                        setTickers(json.tickers);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch tickers:', err);
            }
        };
        fetchTickers();
    }, []);

    // Main data fetch when activeStock changes
    useEffect(() => {
        if (!activeStock) return;

        let isMounted = true;

        const fetchData = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const [ratingsRes, targetsRes, reportsRes] = await Promise.all([
                    fetch(`/api/v1/analyst/ratings/${activeStock}`),
                    fetch(`/api/v1/analyst/targets/${activeStock}`),
                    fetch(`/api/v1/analyst/reports/${activeStock}`)
                ]);

                if (!ratingsRes.ok || !targetsRes.ok || !reportsRes.ok) {
                    throw new Error('Failed to fetch analyst data');
                }

                const ratingsJson = await ratingsRes.json();
                const targetsJson = await targetsRes.json();
                const reportsJson = await reportsRes.json();

                if (isMounted) {
                    // Map Ratings
                    const mappedRatings = (ratingsJson.ratings || []).map((r: any, idx: number) => ({
                        id: `${r.firm_name}-${idx}`,
                        firm: r.firm_name,
                        date: r.date ? r.date.split('T')[0] : 'N/A',
                        rating: r.rating,
                        priceTarget: r.price_target
                    }));

                    const summaryCounts = ratingsJson.summary || { Buy: 0, Hold: 0, Sell: 0 };
                    const summaryData = [
                        { name: 'Buy', value: summaryCounts.Buy || 0, color: '#10B981' },
                        { name: 'Hold', value: summaryCounts.Hold || 0, color: '#FBBF24' },
                        { name: 'Sell', value: summaryCounts.Sell || 0, color: '#F43F5E' }
                    ].filter(d => d.value > 0);

                    // Compile Data
                    setData({
                        tickers,
                        ratingsSummary: {
                            data: summaryData,
                            dominant: ratingsJson.dominant_rating || 'N/A'
                        },
                        ratingsData: mappedRatings,
                        priceTargetStats: {
                            high: targetsJson.high || 0,
                            avg: targetsJson.avg || 0,
                            low: targetsJson.low || 0,
                            upside: targetsJson.upside || 0
                        },
                        currentPrice: targetsJson.current_price || 0,
                        reportsData: reportsJson.map((report: any) => ({
                            ...report,
                            date: report.date ? report.date.split('T')[0] : 'N/A'
                        }))
                    });
                }
            } catch (err) {
                if (isMounted) {
                    setError('Unable to load analyst data for ' + activeStock);
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            isMounted = false;
        };
    }, [activeStock, tickers]);

    return { data, tickers, isLoading, error };
};
