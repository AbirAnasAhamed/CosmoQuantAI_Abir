import React, { useEffect, useRef } from 'react';
import { ISeriesApi, LineStyle, LineSeries } from 'lightweight-charts';
import { VWAPSDDataPoint } from '../../../../utils/indicators';

interface VWAPSDRendererProps {
    chart: any;
    data: VWAPSDDataPoint[];
    visible: boolean;
}

export const VWAPSDRenderer: React.FC<VWAPSDRendererProps> = ({ chart, data, visible }) => {
    const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const upper1SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const lower1SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const upper2SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const lower2SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const upper3SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const lower3SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

    useEffect(() => {
        if (!chart) return;

        // Create series if they don't exist
        if (!vwapSeriesRef.current) {
            vwapSeriesRef.current = chart.addSeries(LineSeries, {
                color: '#fbbf24', // Yellowish / Golden
                lineWidth: 2,
                lineStyle: LineStyle.Solid,
                crosshairMarkerVisible: false,
                lastValueVisible: false,
                priceLineVisible: false,
            });

            // Band 1
            upper1SeriesRef.current = chart.addSeries(LineSeries, {
                color: 'rgba(56, 189, 248, 0.4)', // Light Blue
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                crosshairMarkerVisible: false,
                lastValueVisible: false,
                priceLineVisible: false,
            });
            lower1SeriesRef.current = chart.addSeries(LineSeries, {
                color: 'rgba(56, 189, 248, 0.4)',
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                crosshairMarkerVisible: false,
                lastValueVisible: false,
                priceLineVisible: false,
            });

            // Band 2
            upper2SeriesRef.current = chart.addSeries(LineSeries, {
                color: 'rgba(168, 85, 247, 0.5)', // Purple
                lineWidth: 1,
                lineStyle: LineStyle.Dotted,
                crosshairMarkerVisible: false,
                lastValueVisible: false,
                priceLineVisible: false,
            });
            lower2SeriesRef.current = chart.addSeries(LineSeries, {
                color: 'rgba(168, 85, 247, 0.5)',
                lineWidth: 1,
                lineStyle: LineStyle.Dotted,
                crosshairMarkerVisible: false,
                lastValueVisible: false,
                priceLineVisible: false,
            });

            // Band 3 (Extreme Reversion Zones)
            upper3SeriesRef.current = chart.addSeries(LineSeries, {
                color: 'rgba(239, 68, 68, 0.8)', // Red (Sell Zone)
                lineWidth: 2,
                lineStyle: LineStyle.Solid,
                crosshairMarkerVisible: false,
                lastValueVisible: false,
                priceLineVisible: false,
            });
            lower3SeriesRef.current = chart.addSeries(LineSeries, {
                color: 'rgba(34, 197, 94, 0.8)', // Green (Buy Zone)
                lineWidth: 2,
                lineStyle: LineStyle.Solid,
                crosshairMarkerVisible: false,
                lastValueVisible: false,
                priceLineVisible: false,
            });
        }

        return () => {
            // Cleanup on unmount
            if (chart) {
                try {
                    if (vwapSeriesRef.current) chart.removeSeries(vwapSeriesRef.current);
                    if (upper1SeriesRef.current) chart.removeSeries(upper1SeriesRef.current);
                    if (lower1SeriesRef.current) chart.removeSeries(lower1SeriesRef.current);
                    if (upper2SeriesRef.current) chart.removeSeries(upper2SeriesRef.current);
                    if (lower2SeriesRef.current) chart.removeSeries(lower2SeriesRef.current);
                    if (upper3SeriesRef.current) chart.removeSeries(upper3SeriesRef.current);
                    if (lower3SeriesRef.current) chart.removeSeries(lower3SeriesRef.current);
                } catch (e) {
                    console.warn("Failed to remove VWAP SD series:", e);
                }
                vwapSeriesRef.current = null;
                upper1SeriesRef.current = null;
                lower1SeriesRef.current = null;
                upper2SeriesRef.current = null;
                lower2SeriesRef.current = null;
                upper3SeriesRef.current = null;
                lower3SeriesRef.current = null;
            }
        };
    }, [chart]);

    useEffect(() => {
        if (!vwapSeriesRef.current) return;

        // Apply visibility
        vwapSeriesRef.current.applyOptions({ visible });
        upper1SeriesRef.current?.applyOptions({ visible });
        lower1SeriesRef.current?.applyOptions({ visible });
        upper2SeriesRef.current?.applyOptions({ visible });
        lower2SeriesRef.current?.applyOptions({ visible });
        upper3SeriesRef.current?.applyOptions({ visible });
        lower3SeriesRef.current?.applyOptions({ visible });

        // Set Data
        if (data && data.length > 0) {
            try {
                // Filter out any NaN or undefined values that might crash the chart
                const validData = data.filter(d => d.time && !isNaN(d.vwap));
                
                vwapSeriesRef.current.setData(validData.map(d => ({ time: d.time as any, value: d.vwap })));
                upper1SeriesRef.current?.setData(validData.map(d => ({ time: d.time as any, value: d.upper1 || d.vwap })));
                lower1SeriesRef.current?.setData(validData.map(d => ({ time: d.time as any, value: d.lower1 || d.vwap })));
                upper2SeriesRef.current?.setData(validData.map(d => ({ time: d.time as any, value: d.upper2 || d.vwap })));
                lower2SeriesRef.current?.setData(validData.map(d => ({ time: d.time as any, value: d.lower2 || d.vwap })));
                upper3SeriesRef.current?.setData(validData.map(d => ({ time: d.time as any, value: d.upper3 || d.vwap })));
                lower3SeriesRef.current?.setData(validData.map(d => ({ time: d.time as any, value: d.lower3 || d.vwap })));
            } catch (err) {
                console.warn("Error setting VWAP SD data:", err);
            }
        } else {
            vwapSeriesRef.current.setData([]);
            upper1SeriesRef.current?.setData([]);
            lower1SeriesRef.current?.setData([]);
            upper2SeriesRef.current?.setData([]);
            lower2SeriesRef.current?.setData([]);
            upper3SeriesRef.current?.setData([]);
            lower3SeriesRef.current?.setData([]);
        }
    }, [data, visible]);

    return null;
};
