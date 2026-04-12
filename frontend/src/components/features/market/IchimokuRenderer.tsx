import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { IchimokuDataPoint } from '../../../utils/indicators';

interface IchimokuRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    data: IchimokuDataPoint[];
    displacement: number;
}

export const IchimokuRenderer: React.FC<IchimokuRendererProps> = ({ chart, series, data, displacement }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawRequested = useRef<boolean>(false);

    const requestDraw = useCallback(() => {
        if (!drawRequested.current) {
            drawRequested.current = true;
            requestAnimationFrame(() => {
                drawRequested.current = false;
                drawIchimoku();
            });
        }
    }, [chart, series, data, displacement]);

    const drawIchimoku = useCallback(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!chart || !series || data.length === 0) return;

        const timeScale = chart.timeScale();
        const priceScale = series.priceScale();
        if (!timeScale || !priceScale) return;

        const parent = canvas.parentElement;
        if (parent) {
            if (canvas.width !== parent.clientWidth) canvas.width = parent.clientWidth;
            if (canvas.height !== parent.clientHeight) canvas.height = parent.clientHeight;
        }

        const logicalRange = timeScale.getVisibleLogicalRange();
        if (!logicalRange) return;

        // Colors
        const colors = {
            tenkan: '#00bfff', // Deep Sky Blue
            kijun: '#ff4500',   // Orange Red
            senkouA: 'rgba(0, 255, 0, 0.5)', // Greenish
            senkouB: 'rgba(255, 0, 0, 0.5)', // Reddish
            chikou: '#9370db',  // Medium Purple
            cloudUp: 'rgba(0, 255, 0, 0.1)',
            cloudDown: 'rgba(255, 0, 0, 0.1)'
        };

        const timeWidth = timeScale.width();
        
        // We need to handle the fact that Senkou Spans go into the future
        // and Chikou goes into the past.
        
        // 1. Draw Kumo (Cloud)
        // We draw the cloud by iterating through all points where Senkou A and B overlap
        // A Senkou A value calculated at index i is plotted at i + displacement.
        // So we iterate i, and plot at i + displacement.
        
        const barSpacing = timeWidth / (logicalRange.to - logicalRange.from);

        ctx.beginPath();
        let firstPoint = true;
        
        const getX = (i: number) => {
            // Estimate X for index i (including future/past)
            // timeToCoordinate only works for existing times
            // For future/past, we pivot from the last known time
            if (i >= 0 && i < data.length) {
                return timeScale.timeToCoordinate(data[i].time as any);
            }
            
            // Extrapolate
            const lastIdx = data.length - 1;
            const lastX = timeScale.timeToCoordinate(data[lastIdx].time as any);
            if (lastX === null) return null;
            return lastX + (i - lastIdx) * barSpacing;
        };

        // Draw Cloud
        for (let i = 0; i < data.length; i++) {
            const pt = data[i];
            if (pt.senkouA === null || pt.senkouB === null) continue;

            const futureIdx = i + displacement;
            const x = getX(futureIdx);
            const xNext = getX(futureIdx + 1);
            if (x === null || xNext === null) continue;

            const yA = series.priceToCoordinate(pt.senkouA);
            const yB = series.priceToCoordinate(pt.senkouB);
            if (yA === null || yB === null) continue;

            ctx.fillStyle = pt.senkouA > pt.senkouB ? colors.cloudUp : colors.cloudDown;
            ctx.fillRect(x, Math.min(yA, yB), xNext - x, Math.abs(yA - yB));
            
            // Draw Senkou A and B lines manually for the cloud edges
            ctx.strokeStyle = pt.senkouA > pt.senkouB ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, yA); ctx.lineTo(xNext, yA);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, yB); ctx.lineTo(xNext, yB);
            ctx.stroke();
        }

        // 2. Draw Tenkan and Kijun (Current)
        ctx.setLineDash([]);
        for (let i = 0; i < data.length - 1; i++) {
            const x1 = getX(i);
            const x2 = getX(i + 1);
            if (x1 === null || x2 === null) continue;

            // Tenkan
            if (data[i].tenkan !== null && data[i+1].tenkan !== null) {
                const y1 = series.priceToCoordinate(data[i].tenkan!);
                const y2 = series.priceToCoordinate(data[i+1].tenkan!);
                if (y1 !== null && y2 !== null) {
                    ctx.strokeStyle = colors.tenkan;
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                }
            }
            // Kijun
            if (data[i].kijun !== null && data[i+1].kijun !== null) {
                const y1 = series.priceToCoordinate(data[i].kijun!);
                const y2 = series.priceToCoordinate(data[i+1].kijun!);
                if (y1 !== null && y2 !== null) {
                    ctx.strokeStyle = colors.kijun;
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                }
            }
        }

        // 3. Draw Chikou Span
        for (let i = 0; i < data.length - 1; i++) {
            const x1 = getX(i);
            const x2 = getX(i + 1);
            if (x1 === null || x2 === null) continue;

            if (data[i].chikou !== null && data[i+1].chikou !== null) {
                const y1 = series.priceToCoordinate(data[i].chikou!);
                const y2 = series.priceToCoordinate(data[i+1].chikou!);
                if (y1 !== null && y2 !== null) {
                    ctx.strokeStyle = colors.chikou;
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                }
            }
        }

    }, [chart, series, data, displacement]);

    useEffect(() => {
        if (!chart || !series) return;
        requestDraw();
        const timeScale = chart.timeScale();
        timeScale.subscribeVisibleTimeRangeChange(requestDraw);
        chart.subscribeCrosshairMove(requestDraw);
        return () => {
            timeScale.unsubscribeVisibleTimeRangeChange(requestDraw);
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
