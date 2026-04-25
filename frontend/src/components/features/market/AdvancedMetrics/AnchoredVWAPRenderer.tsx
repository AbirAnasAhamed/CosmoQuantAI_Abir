import React, { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi, LineSeries } from 'lightweight-charts';

interface AnchoredVWAPRendererProps {
    chart: any;
    series: any;
    visible: boolean;
    data?: any;
}

export const AnchoredVWAPRenderer: React.FC<AnchoredVWAPRendererProps> = ({ chart, series, visible, data }) => {
    const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

    useEffect(() => {
        if (!visible || !chart || !data || data.length === 0) {
            if (vwapSeriesRef.current) {
                chart?.removeSeries(vwapSeriesRef.current);
                vwapSeriesRef.current = null;
            }
            return;
        }

        if (!vwapSeriesRef.current) {
            vwapSeriesRef.current = chart.addSeries(LineSeries, {
                color: '#f59e0b', // amber-500
                lineWidth: 2,
                crosshairMarkerVisible: false,
                lastValueVisible: true,
                priceLineVisible: false,
            });
        }

        try {
            // Data must be sorted by time
            const sortedData = [...data].sort((a, b) => a.time - b.time);
            vwapSeriesRef.current.setData(sortedData);
        } catch (e) {
            console.warn("Failed to set VWAP data", e);
        }

        return () => {
            // Visibility change handles cleanup
        };
    }, [chart, visible, data]);

    // Full cleanup on unmount
    useEffect(() => {
        return () => {
            if (vwapSeriesRef.current && chart) {
                try {
                    chart.removeSeries(vwapSeriesRef.current);
                } catch (e) {}
            }
        };
    }, [chart]);

    return null;
};
