import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickData, SeriesMarker, Time, CandlestickSeries } from 'lightweight-charts';

interface SimulationChartProps {
    data: CandlestickData[];
    colors?: {
        backgroundColor?: string;
        lineColor?: string;
        textColor?: string;
        areaTopColor?: string;
        areaBottomColor?: string;
    };
}

export interface SimulationChartHandle {
    updateCandle: (candle: CandlestickData) => void;
    setMarkers: (markers: SeriesMarker<Time>[]) => void;
    reset: () => void;
}

const SimulationChart = forwardRef<SimulationChartHandle, SimulationChartProps>((props, ref) => {
    const {
        data,
        colors: {
            backgroundColor = 'transparent',
            textColor = '#D9D9D9',
        } = {},
    } = props;

    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

    useImperativeHandle(ref, () => ({
        updateCandle: (candle: CandlestickData) => {
            if (seriesRef.current) {
                seriesRef.current.update(candle);
            }
        },
        setMarkers: (markers: SeriesMarker<Time>[]) => {
            if (seriesRef.current) {
                // @ts-ignore - setMarkers exists on CandlestickSeries but types availability varies by version
                if (typeof seriesRef.current.setMarkers === 'function') {
                    // @ts-ignore
                    seriesRef.current.setMarkers(markers);
                }
            }
        },
        reset: () => {
            if (seriesRef.current) {
                seriesRef.current.setData([]);
            }
        }
    }));

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const handleResize = () => {
            if (chartRef.current && chartContainerRef.current) {
                chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: backgroundColor },
                textColor,
            },
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
            grid: {
                vertLines: { color: '#334155' },
                horzLines: { color: '#334155' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: true,
            },
        });

        chartRef.current = chart;

        // v5 API: addSeries(CandlestickSeries, options)
        const series = chart.addSeries(CandlestickSeries, {
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });

        seriesRef.current = series;
        series.setData(data);

        // ResizeObserver for robust sizing
        const resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0 || !entries[0].target) return;
            const newRect = entries[0].contentRect;
            chart.applyOptions({ width: newRect.width, height: newRect.height });
        });

        resizeObserver.observe(chartContainerRef.current);

        return () => {
            resizeObserver.disconnect();
            chart.remove();
        };
    }, [backgroundColor, textColor]);

    return (
        <div
            ref={chartContainerRef}
            className="w-full h-full relative"
        />
    );
});

export default SimulationChart;
