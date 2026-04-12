import React, { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, LineSeries } from 'lightweight-charts';

export interface CVDDataPoint {
    time: number;
    value: number;
}

interface CVDChartProps {
    mainChart: IChartApi | null;
    data: CVDDataPoint[];
}

export const CVDChart: React.FC<CVDChartProps> = ({ mainChart, data }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);

    // Disable syncing while syncing to prevent infinite loop
    const isSyncingRef = useRef(false);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: 'solid', color: 'transparent' } as any,
                textColor: '#94a3b8',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            timeScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                visible: false, // Hide timescale numbers, keep it synced, but visually cleaner
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                autoScale: true,
            },
            crosshair: {
                mode: 1, // normal crosshair
            }
        });

        const series = chart.addSeries(LineSeries, {
            color: '#3b82f6', // blue
            lineWidth: 2,
            crosshairMarkerVisible: true,
            priceFormat: {
                type: 'volume',
            }
        });

        chartRef.current = chart;
        seriesRef.current = series;

        if (data && data.length > 0) {
            series.setData(data as any);
        }

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight
                });
            }
        };

        window.addEventListener('resize', handleResize);
        setTimeout(handleResize, 100);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, []);

    // Sync Data
    useEffect(() => {
        if (seriesRef.current && data && data.length > 0) {
            // Lightweight charts require strictly ascending, unique time points
            const uniqueDataMap = new Map<number, CVDDataPoint>();
            data.forEach(item => {
                uniqueDataMap.set(item.time, item);
            });
            const sortedData = Array.from(uniqueDataMap.values()).sort((a, b) => a.time - b.time);
            
            try {
                seriesRef.current.setData(sortedData as any);
            } catch (err) {
                console.error("Failed to set CVD Chart data:", err);
            }
        }
    }, [data]);

    // Sync Time Scales
    useEffect(() => {
        if (!mainChart || !chartRef.current) return;

        const cvdChart = chartRef.current;
        const mainTimeScale = mainChart.timeScale();
        const cvdTimeScale = cvdChart.timeScale();

        const syncMainToCVD = (logicalRange: any) => {
            if (!logicalRange || isSyncingRef.current) return;
            isSyncingRef.current = true;
            cvdTimeScale.setVisibleLogicalRange(logicalRange);
            isSyncingRef.current = false;
        };

        const syncCVDToMain = (logicalRange: any) => {
            if (!logicalRange || isSyncingRef.current) return;
            isSyncingRef.current = true;
            mainTimeScale.setVisibleLogicalRange(logicalRange);
            isSyncingRef.current = false;
        };

        const syncCrosshairMainToCVD = (param: any) => {
            if (!param.point || isSyncingRef.current) {
                cvdChart.clearCrosshairPosition();
                return;
            }
            isSyncingRef.current = true;
            const time = param.time;
            if (time) {
                // Find point by time on the line series
                const seriesData = seriesRef.current?.dataByIndex(param.logical);
                if (seriesData && 'value' in seriesData) {
                    cvdChart.setCrosshairPosition((seriesData as any).value as number, param.time, seriesRef.current!);
                }
            }
            isSyncingRef.current = false;
        };

        const syncCrosshairCVDToMain = (param: any) => {
            if (isSyncingRef.current) return;
            // Full 2-way crosshair sync is tricky due to main chart having multiple series. 
            // We mainly want Main scale -> CVD sync
        };

        mainTimeScale.subscribeVisibleLogicalRangeChange(syncMainToCVD);
        cvdTimeScale.subscribeVisibleLogicalRangeChange(syncCVDToMain);
        mainChart.subscribeCrosshairMove(syncCrosshairMainToCVD);

        // Initial sync
        const initialRange = mainTimeScale.getVisibleLogicalRange();
        if (initialRange) cvdTimeScale.setVisibleLogicalRange(initialRange);

        return () => {
            mainTimeScale.unsubscribeVisibleLogicalRangeChange(syncMainToCVD);
            cvdTimeScale.unsubscribeVisibleLogicalRangeChange(syncCVDToMain);
            mainChart.unsubscribeCrosshairMove(syncCrosshairMainToCVD);
        };
    }, [mainChart]);

    return (
        <div ref={chartContainerRef} className="w-full h-full absolute inset-0 z-0" />
    );
};
