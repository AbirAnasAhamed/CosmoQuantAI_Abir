import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';

export interface HeatmapDataPoint {
    time: number; // Unix timestamp
    levels: { price: number; volume: number; type: 'bid' | 'ask' }[];
}

interface LiquidityHeatmapRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    data: HeatmapDataPoint[];
}

export const LiquidityHeatmapRenderer: React.FC<LiquidityHeatmapRendererProps> = ({ chart, series, data }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawRequested = useRef<boolean>(false);

    // Debounced draw function to restrict repaints strictly to framerate/needs
    const requestDraw = useCallback(() => {
        if (!drawRequested.current) {
            drawRequested.current = true;
            requestAnimationFrame(() => {
                drawRequested.current = false;
                drawHeatmap();
            });
        }
    }, [chart, series, data]);

    const drawHeatmap = useCallback(() => {
        if (!chart || !series || !canvasRef.current || data.length === 0) return;

        try {
            const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let timeScale, priceScale;
        try {
            timeScale = chart.timeScale();
            priceScale = series.priceScale();
        } catch (e) {
            // Unmounted or uninitialized series
            return;
        }
        if (!timeScale || !priceScale) return;

        // Sync canvas size to fit the chart pane
        const timeWidth = timeScale.width();

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const logicalRange = timeScale.getVisibleLogicalRange();
        if (!logicalRange) return;

        // Exact width of one logical bar on the screen
        const barSpacing = timeWidth / Math.max(1, logicalRange.to - logicalRange.from);

        // Global or local max? We use visible range max for dynamic contrast
        let maxVol = 1;
        const fromIdx = Math.max(0, Math.floor(logicalRange.from || 0));
        const toIdx = Math.min(data.length - 1, Math.ceil(logicalRange.to || data.length - 1));

        for (let i = fromIdx; i <= toIdx; i++) {
            if (data[i]) {
                for (const lv of data[i].levels) {
                    maxVol = Math.max(maxVol, lv.volume);
                }
            }
        }

        const len = data.length;
        ctx.globalCompositeOperation = 'source-over';

        // Determine zoom level and thresholds based on exact barSpacing value
        const isZoomedOut = barSpacing < 2.0;
        const minIntensityThreshold = isZoomedOut ? 0.2 : 0.05;

        for (let i = fromIdx - 5; i <= toIdx + 5; i++) {
            if (i < 0 || i >= len) continue;

            const pt = data[i];
            const x = timeScale.timeToCoordinate(pt.time as any);
            if (x === null) continue;

            const barWidth = Math.max(1.5, barSpacing);
            const cellHeight = 4;
            
            if (x < -barWidth || x > timeWidth + barWidth) continue;

            if (isZoomedOut) {
                // DATA DECIMATION / LEVEL GROUPING
                // Group volume by Y-coordinate bucket (e.g. 4 pixels) to limit rendering calls 
                // in heavily zoomed out timeframes
                const yBuckets = new Map<number, number>();
                
                for (let j = 0; j < pt.levels.length; j++) {
                    const level = pt.levels[j];
                    const yRaw = series.priceToCoordinate(level.price);
                    if (yRaw === null) continue;
                    
                    const y = Math.floor(yRaw / cellHeight) * cellHeight;
                    yBuckets.set(y, (yBuckets.get(y) || 0) + level.volume);
                }
                
                yBuckets.forEach((totalVolume, y) => {
                    const rawIntensity = totalVolume / maxVol;
                    const intensity = Math.min(1.0, rawIntensity); // normalize if exceeded
                    
                    if (intensity < minIntensityThreshold) return;

                    let r, g, b, a;
                    if (intensity < 0.5) {
                        r = 239; g = 68; b = 68; // Red
                        a = intensity * 2 * 0.4;
                    } else if (intensity < 0.8) {
                        r = 249; g = 115; b = 22; // Orange
                        a = 0.4 + (intensity - 0.5) * 2 * 0.4;
                    } else {
                        r = 253; g = 224; b = 71; // Yellow
                        a = 0.8 + (intensity - 0.8) * 5 * 0.2;
                    }

                    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
                    ctx.fillRect(Math.floor(x - barWidth / 2), Math.floor(y - cellHeight / 2), Math.ceil(barWidth), cellHeight);
                });
                
            } else {
                // NORMAL RENDERING
                for (let j = 0; j < pt.levels.length; j++) {
                    const level = pt.levels[j];
                    const y = series.priceToCoordinate(level.price);
                    if (y === null) continue;

                    const intensity = level.volume / maxVol;
                    if (intensity < minIntensityThreshold) continue; 

                    // Gradient color mapping
                    let r, g, b, a;
                    if (intensity < 0.5) {
                        r = 239; g = 68; b = 68; // Red
                        a = intensity * 2 * 0.4; // Max 0.4 opacity for lower half
                    } else if (intensity < 0.8) {
                        r = 249; g = 115; b = 22; // Orange
                        a = 0.4 + (intensity - 0.5) * 2 * 0.4; // Max 0.8 opacity
                    } else {
                        r = 253; g = 224; b = 71; // Yellow
                        a = 0.8 + (intensity - 0.8) * 5 * 0.2; // Max 1.0 opacity
                    }

                    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
                    ctx.fillRect(Math.floor(x - barWidth / 2), Math.floor(y - cellHeight / 2), Math.ceil(barWidth), cellHeight);
                }
            }
        }
    } catch (error) {
        console.error("Error in Heatmap drawHeatmap:", error);
    }
}, [chart, series, data]);

    // Handle Canvas Resizing optimally without Layout Thrashing
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;

        // Set initial size
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;

        const observer = new ResizeObserver(() => {
            if (canvas.width !== parent.clientWidth) canvas.width = parent.clientWidth;
            if (canvas.height !== parent.clientHeight) canvas.height = parent.clientHeight;
            requestDraw();
        });

        observer.observe(parent);

        return () => {
            observer.disconnect();
        };
    }, [requestDraw]);

    useEffect(() => {
        if (!chart || !series) return;

        // Draw initially
        requestDraw();

        // Subscribe to chart events directly rather than blindly looping
        const timeScale = chart.timeScale();

        timeScale.subscribeVisibleTimeRangeChange(requestDraw);
        timeScale.subscribeSizeChange(requestDraw);
        chart.subscribeCrosshairMove(requestDraw);

        return () => {
            timeScale.unsubscribeVisibleTimeRangeChange(requestDraw);
            timeScale.unsubscribeSizeChange(requestDraw);
            chart.unsubscribeCrosshairMove(requestDraw);
        };
    }, [chart, series, requestDraw]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 pointer-events-none"
            style={{ zIndex: 1 }}
        />
    );
};
