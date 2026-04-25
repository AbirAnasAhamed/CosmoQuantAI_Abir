import React, { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi, HistogramSeries } from 'lightweight-charts';

interface OIBData {
    oib: number;
    total_bid_vol: number;
    total_ask_vol: number;
    timestamp: number;
}

interface OIBOscillatorRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    visible: boolean;
    data?: OIBData;
}

export const OIBOscillatorRenderer: React.FC<OIBOscillatorRendererProps> = ({ chart, series, visible, data }) => {
    const oibSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

    useEffect(() => {
        if (!visible || !chart || !data || !data.timestamp) {
            if (oibSeriesRef.current) {
                chart?.removeSeries(oibSeriesRef.current);
                oibSeriesRef.current = null;
            }
            return;
        }

        if (!oibSeriesRef.current) {
            oibSeriesRef.current = chart.addSeries(HistogramSeries, {
                color: '#26a69a',
                priceFormat: { type: 'volume' },
                priceScaleId: 'oib_scale',
            });
            
            // Apply scale margins to the price scale directly
            chart.priceScale('oib_scale').applyOptions({
                scaleMargins: {
                    top: 0.8,
                    bottom: 0,
                },
            });
        }

        const time = Math.floor(data.timestamp / 1000) as any;
        
        // Use green for positive imbalance, red for negative
        const color = data.oib > 0 ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)';

        try {
            oibSeriesRef.current.update({
                time,
                value: data.oib,
                color: color
            });
        } catch (e) {
            // Might throw if time is older than the last one in the series, ignore for live updates
            console.warn("Failed to update OIB Series", e);
        }

        return () => {
            // Cleanup handled by visibility check
        };
    }, [chart, data, visible]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (oibSeriesRef.current && chart) {
                try {
                    chart.removeSeries(oibSeriesRef.current);
                } catch (e) {}
            }
        };
    }, [chart]);

    return null;
};
