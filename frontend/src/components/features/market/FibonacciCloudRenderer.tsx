import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';

export interface FibonacciLevel {
    level: number;
    price: number;
    title: string;
    color: string;
    cloudColor: string;
}

export interface FibonacciData {
    highest: number;
    lowest: number;
    highTime: number;
    lowTime: number;
    levels: FibonacciLevel[];
}

interface FibonacciCloudRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    data: FibonacciData | null;
}

export const FibonacciCloudRenderer: React.FC<FibonacciCloudRendererProps> = ({ chart, series, data }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawRequested = useRef<boolean>(false);

    const requestDraw = useCallback(() => {
        if (!drawRequested.current) {
            drawRequested.current = true;
            requestAnimationFrame(() => {
                drawRequested.current = false;
                drawClouds();
            });
        }
    }, [chart, series, data]);

    const drawClouds = useCallback(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!chart || !series || !data) return;

        const timeScale = chart.timeScale();
        const priceScale = series.priceScale();
        if (!timeScale || !priceScale) return;

        const timeWidth = timeScale.width();
        const parent = canvas.parentElement;
        if (parent) {
            if (canvas.width !== parent.clientWidth) canvas.width = parent.clientWidth;
            if (canvas.height !== parent.clientHeight) canvas.height = parent.clientHeight;
        }

        const { levels, highest, lowest, highTime, lowTime } = data;
        
        // 1. Draw Clouds
        for (let i = 0; i < levels.length - 1; i++) {
            const top = levels[i + 1];
            const bottom = levels[i];

            const yTop = series.priceToCoordinate(top.price);
            const yBottom = series.priceToCoordinate(bottom.price);

            if (yTop !== null && yBottom !== null) {
                ctx.fillStyle = top.cloudColor;
                // Draw from the earlier of highTime/lowTime to the right edge
                const startTime = Math.min(highTime, lowTime);
                const xStart = timeScale.timeToCoordinate(startTime as any);
                const xEnd = timeWidth;
                
                const drawX = xStart !== null ? Math.max(0, xStart) : 0;
                
                ctx.fillRect(drawX, Math.min(yTop, yBottom), xEnd - drawX, Math.abs(yTop - yBottom));
            }
        }

        // 2. Draw Fibonacci Lines & Labels
        levels.forEach(lvl => {
            const y = series.priceToCoordinate(lvl.price);
            if (y !== null) {
                const startTime = Math.min(highTime, lowTime);
                const xStart = timeScale.timeToCoordinate(startTime as any);
                const xEnd = timeWidth;
                const drawX = xStart !== null ? Math.max(0, xStart) : 0;

                // Line
                ctx.beginPath();
                ctx.strokeStyle = lvl.color;
                ctx.lineWidth = 1;
                ctx.moveTo(drawX, y);
                ctx.lineTo(xEnd, y);
                ctx.stroke();

                // Label: level(price)
                ctx.fillStyle = lvl.color;
                ctx.font = 'bold 11px font-mono, sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                
                const formattedPrice = lvl.price < 0.0001 ? lvl.price.toFixed(8) : lvl.price < 1 ? lvl.price.toFixed(5) : lvl.price.toFixed(2);
                const label = `${lvl.level}(${formattedPrice})`;
                ctx.fillText(label, drawX + 8, y - 4);
            }
        });

        // 3. Draw Diagonal Trend Line (High to Low)
        const xHigh = timeScale.timeToCoordinate(highTime as any);
        const yHigh = series.priceToCoordinate(highest);
        const xLow = timeScale.timeToCoordinate(lowTime as any);
        const yLow = series.priceToCoordinate(lowest);

        if (xHigh !== null && yHigh !== null && xLow !== null && yLow !== null) {
            ctx.beginPath();
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.moveTo(xHigh, yHigh);
            ctx.lineTo(xLow, yLow);
            ctx.stroke();
            ctx.setLineDash([]); // Reset dash for subsequent draws
        }

    }, [chart, series, data]);

    useEffect(() => {
        if (!chart || !series) return;
        requestDraw();

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
