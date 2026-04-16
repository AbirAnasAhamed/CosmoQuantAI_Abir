import React, { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi, LineSeries, HistogramSeries, LineStyle } from 'lightweight-charts';
import { calculateMACD } from '../../../utils/indicators';

interface MACDRendererProps {
    chart: IChartApi | null;
    data: any[];
    visible: boolean;
    fast: number;
    slow: number;
    signal: number;
}

export const MACDRenderer: React.FC<MACDRendererProps> = ({ chart, data, visible, fast, slow, signal }) => {
    const macdLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const macdSignalSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const macdHistSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

    useEffect(() => {
        if (!chart) return;

        // Create MACD Series
        const macdHistSeries = chart.addSeries(HistogramSeries, { 
            color: '#22c55e', 
            priceScaleId: 'left', 
            title: 'MACD Hist',
            visible: visible 
        });
        const macdLineSeries = chart.addSeries(LineSeries, { 
            color: '#3b82f6', 
            lineWidth: 2, 
            priceScaleId: 'left', 
            title: 'MACD',
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            visible: visible
        });
        const macdSignalSeries = chart.addSeries(LineSeries, { 
            color: '#ef4444', 
            lineWidth: 2, 
            priceScaleId: 'left', 
            title: 'Signal',
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            visible: visible
        });

        macdLineSeriesRef.current = macdLineSeries;
        macdSignalSeriesRef.current = macdSignalSeries;
        macdHistSeriesRef.current = macdHistSeries;

        return () => {
            if (chart) {
                try {
                    chart.removeSeries(macdLineSeries);
                    chart.removeSeries(macdSignalSeries);
                    chart.removeSeries(macdHistSeries);
                } catch (e) {
                    // Series might already be removed
                }
            }
            macdLineSeriesRef.current = null;
            macdSignalSeriesRef.current = null;
            macdHistSeriesRef.current = null;
        };
    }, [chart]); // Only run on chart instance change

    // Handle Data & Visibility Updates
    useEffect(() => {
        if (!chart || !macdLineSeriesRef.current || !data || data.length === 0) return;

        // Toggle Visibility
        macdLineSeriesRef.current.applyOptions({ visible });
        macdSignalSeriesRef.current?.applyOptions({ visible });
        macdHistSeriesRef.current?.applyOptions({ visible });

        if (visible) {
            const macdData = calculateMACD(data, fast, slow, signal);
            if (macdData && macdData.length > 0) {
                macdLineSeriesRef.current.setData(macdData.map((d: any) => ({ time: d.time, value: d.macd })) as any);
                macdSignalSeriesRef.current?.setData(macdData.map((d: any) => ({ time: d.time, value: d.signal })) as any);
                macdHistSeriesRef.current?.setData(macdData.map((d: any) => ({ 
                    time: d.time, 
                    value: d.histogram,
                    color: d.histogram >= 0 ? '#22c55e80' : '#ef444480'
                })) as any);
            }
        }
    }, [chart, data, visible, fast, slow, signal]);

    return null; // This is a "Manager" component, no visual output outside the chart object
};
